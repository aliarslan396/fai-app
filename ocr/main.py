"""
FAI OCR Microservice
====================
Single-purpose FastAPI service that takes a rendered drawing page image
and returns extracted text + bounding boxes + confidence scores.

Pipeline:
  1. Decode image bytes
  2. OpenCV preprocess: grayscale, deskew, denoise, adaptive threshold
  3. Tesseract OCR with TSV output for word-level boxes
  4. Group words into lines + filter low-confidence noise
  5. Return structured JSON

Designed to be called via internal Docker network from the Laravel app.
"""

from __future__ import annotations

import io
import logging
import time

import cv2
import numpy as np
import pytesseract
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel

from classifier import classify, health as classifier_health

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("fai-ocr")

app = FastAPI(title="FAI OCR Service", version="0.3.0")


# ---------- Response models ----------

class TextBlock(BaseModel):
    text: str
    bbox: list[int]  # [x, y, w, h]
    confidence: float  # 0.0 - 1.0
    block_num: int
    line_num: int


class OcrResult(BaseModel):
    width: int
    height: int
    blocks: list[TextBlock]
    raw_text: str
    processing_ms: int
    preprocess: dict


# ---------- Health ----------

@app.get("/health")
def health():
    """Tesseract + OpenCV reachable?"""
    try:
        version = pytesseract.get_tesseract_version()
        return {
            "status": "ok",
            "tesseract": str(version),
            "opencv": cv2.__version__,
            "ollama": classifier_health(),
        }
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=str(e))


# ---------- Classification (Ollama-backed) ----------

class ClassifyRequest(BaseModel):
    text: str


class ClassifyBatchRequest(BaseModel):
    texts: list[str]


@app.post("/classify")
def classify_one(req: ClassifyRequest):
    """Classify a single OCR text snippet into structured char fields."""
    return classify(req.text)


@app.post("/classify-batch")
def classify_batch(req: ClassifyBatchRequest):
    """Sequentially classify multiple snippets. Returns list in input order."""
    if len(req.texts) > 100:
        raise HTTPException(status_code=400, detail="max 100 snippets per batch")
    return {"results": [classify(t) for t in req.texts]}


# ---------- Preprocess ----------

def preprocess_image(image_bgr: np.ndarray, mode: str = "auto") -> tuple[np.ndarray, dict]:
    """
    Returns (processed_image, debug_info).
    mode:
      - auto: pick best for engineering drawings (default)
      - none: skip preprocessing
      - aggressive: harder threshold for poor scans
    """
    info: dict = {"mode": mode, "input_shape": list(image_bgr.shape)}

    if mode == "none":
        gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
        return gray, info

    # 1. Grayscale
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)

    # 2. Light denoise (preserve thin lines / dimension marks)
    denoised = cv2.fastNlMeansDenoising(gray, h=10)

    # 3. Deskew — only for genuinely skewed scans, NOT engineering drawings.
    #    Engineering drawings have lots of vertical text (title blocks, dims)
    #    which confuses minAreaRect into returning false rotations. Skip when
    #    detected angle is > 10° (almost certainly a false positive on CAD).
    coords = np.column_stack(np.where(denoised < 200))
    if len(coords) > 100:
        angle_rect = cv2.minAreaRect(coords)[-1]
        if angle_rect < -45:
            angle = -(90 + angle_rect)
        else:
            angle = -angle_rect
        if 0.3 < abs(angle) < 10.0:
            (h, w) = denoised.shape
            center = (w // 2, h // 2)
            M = cv2.getRotationMatrix2D(center, angle, 1.0)
            denoised = cv2.warpAffine(
                denoised,
                M,
                (w, h),
                flags=cv2.INTER_CUBIC,
                borderMode=cv2.BORDER_REPLICATE,
            )
            info["deskew_angle"] = round(float(angle), 3)
        else:
            info["deskew_angle"] = 0
            info["deskew_skipped"] = round(float(angle), 3)

    # 4. Adaptive threshold for varied background
    if mode == "aggressive":
        threshed = cv2.adaptiveThreshold(
            denoised, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 15
        )
    else:
        # Otsu binarization works well for clean vector PDF renders
        _, threshed = cv2.threshold(denoised, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    info["output_shape"] = list(threshed.shape)
    return threshed, info


# ---------- OCR ----------

# Tessearact char whitelist for the numeric-focused pass. Permissive so we
# don't break legit text like "Ra μin"; tight enough to discourage garbage.
ENGINEERING_WHITELIST = (
    "0123456789"
    ".,-+/×x°±"
    "ØRr⌀"
    "⊕⊥⏥⌭⌒⌓∠∥◎≡↗⇗○⏤"
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    "()[]{}"
    " "
)


def run_tesseract(
    image: np.ndarray,
    lang: str = "eng",
    psm: int = 6,
    min_confidence: float = 0.5,
    whitelist: str | None = None,
) -> list[TextBlock]:
    """
    Run Tesseract with TSV output to get word-level positions.

    psm modes for engineering drawings:
      - 6 = single uniform block (default)
      - 11 = sparse text (good for scattered dimensions)
      - 12 = sparse text with OSD

    whitelist: optional char whitelist (tessedit_char_whitelist). Use for
    numeric-focused passes that should reject most letters.
    """
    config_parts = [f"--oem 3 --psm {psm}"]
    if whitelist:
        # Escape characters that have meaning in the tesseract config syntax
        safe = whitelist.replace('"', '')
        config_parts.append(f'-c tessedit_char_whitelist="{safe}"')
    config = " ".join(config_parts)

    tsv = pytesseract.image_to_data(
        image,
        lang=lang,
        config=config,
        output_type=pytesseract.Output.DICT,
    )

    blocks: list[TextBlock] = []
    n = len(tsv["text"])
    for i in range(n):
        text = (tsv["text"][i] or "").strip()
        if not text:
            continue
        try:
            conf = float(tsv["conf"][i])
        except (TypeError, ValueError):
            conf = -1
        if conf < 0:
            continue
        conf_norm = max(0.0, min(1.0, conf / 100.0))
        if conf_norm < min_confidence:
            continue
        blocks.append(
            TextBlock(
                text=text,
                bbox=[
                    int(tsv["left"][i]),
                    int(tsv["top"][i]),
                    int(tsv["width"][i]),
                    int(tsv["height"][i]),
                ],
                confidence=round(conf_norm, 3),
                block_num=int(tsv["block_num"][i]),
                line_num=int(tsv["line_num"][i]),
            )
        )
    return blocks


def upscale_image(image: np.ndarray, factor: float) -> np.ndarray:
    """Upscale image with cubic interpolation. Equivalent to higher-DPI render
    for OCR purposes — Tesseract reads tiny text MUCH better at 2x size."""
    if factor <= 1.0:
        return image
    h, w = image.shape[:2]
    new_w = int(w * factor)
    new_h = int(h * factor)
    return cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_CUBIC)


def _block_key(b: TextBlock, tol_px: int = 10) -> tuple:
    """Dedup key — blocks at roughly same position with same text are duplicates."""
    x, y, w, h = b.bbox
    return (b.text.strip().lower(), x // tol_px, y // tol_px)


def merge_block_runs(*runs: list[TextBlock]) -> list[TextBlock]:
    """Union multiple OCR passes' results, deduping near-identical blocks.
    Keeps the highest-confidence copy when duplicates exist."""
    by_key: dict[tuple, TextBlock] = {}
    for run in runs:
        for b in run:
            k = _block_key(b)
            existing = by_key.get(k)
            if existing is None or b.confidence > existing.confidence:
                by_key[k] = b
    return list(by_key.values())


# ---------- Main endpoint ----------

@app.post("/process", response_model=OcrResult)
async def process(
    file: UploadFile = File(..., description="Page image (PNG/JPG)"),
    preprocess: str = Form("auto", description="auto | none | aggressive"),
    psm: int = Form(6, description="Tesseract PSM (legacy; ignored when multi=true)"),
    min_confidence: float = Form(0.5, description="Drop blocks below this 0.0-1.0 confidence"),
    lang: str = Form("eng"),
    scale: float = Form(2.0, description="Upscale factor before OCR. 2.0 = approx 300 DPI from 150 DPI source"),
    multi: bool = Form(True, description="Run multiple PSM passes + dedupe. Boosts recall on engineering drawings"),
):
    if preprocess not in ("auto", "none", "aggressive"):
        raise HTTPException(status_code=400, detail="preprocess must be auto|none|aggressive")

    start = time.time()
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="empty file")

    # Decode via PIL → numpy BGR
    try:
        pil_img = Image.open(io.BytesIO(contents))
        pil_img.load()
        if pil_img.mode != "RGB":
            pil_img = pil_img.convert("RGB")
        rgb = np.array(pil_img)
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"could not decode image: {e}")

    orig_h, orig_w = bgr.shape[:2]
    log.info("OCR: received %sx%s image, %d bytes (scale=%s, multi=%s)",
             orig_w, orig_h, len(contents), scale, multi)

    processed, preprocess_info = preprocess_image(bgr, preprocess)

    # Fix 1 — Upscale for better small-text recall
    scaled = upscale_image(processed, scale)
    preprocess_info["scale_factor"] = scale
    preprocess_info["scaled_shape"] = list(scaled.shape)

    # Fix 2 — Multi-PSM passes; Fix 4 — engineering whitelist on numeric pass
    if multi:
        blocks_6 = run_tesseract(scaled, lang=lang, psm=6, min_confidence=min_confidence)
        blocks_11 = run_tesseract(scaled, lang=lang, psm=11, min_confidence=min_confidence)
        # Numeric-focused pass — catches dim text the general pass missed
        blocks_num = run_tesseract(
            scaled, lang=lang, psm=11, min_confidence=min_confidence,
            whitelist=ENGINEERING_WHITELIST,
        )
        merged = merge_block_runs(blocks_6, blocks_11, blocks_num)
        preprocess_info["psm_passes"] = {
            "psm6": len(blocks_6),
            "psm11": len(blocks_11),
            "psm11_whitelist": len(blocks_num),
            "after_dedup": len(merged),
        }
        blocks = merged
    else:
        blocks = run_tesseract(scaled, lang=lang, psm=psm, min_confidence=min_confidence)

    # Scale bboxes back to original image coords so client coords stay correct
    if scale > 1.0:
        for b in blocks:
            x, y, w_, h_ = b.bbox
            b.bbox = [
                int(round(x / scale)),
                int(round(y / scale)),
                int(round(w_ / scale)),
                int(round(h_ / scale)),
            ]

    raw_text = "\n".join(b.text for b in blocks)
    elapsed_ms = int((time.time() - start) * 1000)
    log.info("OCR: %d blocks extracted in %d ms", len(blocks), elapsed_ms)

    return OcrResult(
        width=orig_w,
        height=orig_h,
        blocks=blocks,
        raw_text=raw_text,
        processing_ms=elapsed_ms,
        preprocess=preprocess_info,
    )
