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

app = FastAPI(title="FAI OCR Service", version="0.1.0")


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

def run_tesseract(image: np.ndarray, lang: str = "eng", psm: int = 6, min_confidence: float = 0.5) -> list[TextBlock]:
    """
    Run Tesseract with TSV output to get word-level positions.

    psm modes for engineering drawings:
      - 6 = single uniform block (default)
      - 11 = sparse text (good for scattered dimensions)
      - 12 = sparse text with OSD
    """
    config = f"--oem 3 --psm {psm}"
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


# ---------- Main endpoint ----------

@app.post("/process", response_model=OcrResult)
async def process(
    file: UploadFile = File(..., description="Page image (PNG/JPG)"),
    preprocess: str = Form("auto", description="auto | none | aggressive"),
    psm: int = Form(6, description="Tesseract page segmentation mode"),
    min_confidence: float = Form(0.5, description="Drop blocks below this 0.0-1.0 confidence"),
    lang: str = Form("eng"),
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

    h, w = bgr.shape[:2]
    log.info("OCR: received %sx%s image, %d bytes", w, h, len(contents))

    processed, preprocess_info = preprocess_image(bgr, preprocess)
    blocks = run_tesseract(processed, lang=lang, psm=psm, min_confidence=min_confidence)

    raw_text = "\n".join(b.text for b in blocks)
    elapsed_ms = int((time.time() - start) * 1000)
    log.info("OCR: %d blocks extracted in %d ms", len(blocks), elapsed_ms)

    return OcrResult(
        width=w,
        height=h,
        blocks=blocks,
        raw_text=raw_text,
        processing_ms=elapsed_ms,
        preprocess=preprocess_info,
    )
