"""
FAI characteristic classifier — Ollama + local LLM.

Tier 1 hardening (2026-06-25):
  - Pre-filter clearly non-dimensional text (zone labels, multipliers,
    page indicators) BEFORE the LLM ever sees them. Saves time + boosts
    signal-to-noise.
  - Stricter prompt with explicit REJECT examples.
  - Reference-dim detection: text wrapped in parens (e.g. "(1.250)")
    is a reference dimension — no tolerance, no Pass/Fail check.
  - Stricter confidence scoring: penalize missing nominal, missing unit
    inference for non-GD&T, etc.

Model: env OLLAMA_MODEL (default llama3.2:3b on 4 GB droplet;
swap to "mistral" when droplet upgraded to ≥16 GB).

Output JSON shape (canonical):
{
  "char_type": "linear" | "diameter" | "radius" | "angle" | "gdt" | "surface_finish" | "skip" | "note",
  "nominal": float | null,
  "upper_tolerance": float | null,
  "lower_tolerance": float | null,
  "unit": str | null,
  "gdt_symbol": str | null,
  "gdt_datums": [str],
  "finish_value": str | null,
  "finish_unit": str | null,
  "is_reference": bool,            # text was in parens
  "confidence": float
}
"""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import httpx

log = logging.getLogger("fai-ocr.classifier")

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://ollama:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2:3b")
OLLAMA_TIMEOUT = float(os.environ.get("OLLAMA_TIMEOUT_S", "60"))


# ---------- Pre-filter: kill obvious non-dimensional text ----------

_GDT_GLYPHS = set("⊕⊥⏥⌭⌒⌓∠∥◎≡↗⇗○⏤Ø∅")

# Patterns that should NEVER reach the LLM.
_SKIP_PATTERNS = [
    re.compile(r"^\s*$"),                            # empty
    re.compile(r"^\d+\s*/\s*\d+$"),                  # page indicators "1/1", "2/6"
    re.compile(r"^[A-Z]?\d+[xX]\s*$"),               # multipliers "2X", "4X", "B2X"
    re.compile(r"^[A-H]\d{1,2}$"),                   # zone markers like "C5", "B9"
    re.compile(r"^[\(\[\{]\s*\d{2,4}\s*[\)\]\}]$"),  # bare "(208)" — but allow if has dot
    re.compile(r"^\d+\s*[,;]\s*\d*$"),               # OCR junk "06887,"
    re.compile(r"^[\(\[\{]\s*[A-Z]?\d+\s*[\)\]\}]\s*[A-Z]?$"),  # "(1)A" type stuff
    re.compile(r"^[A-Z]+$"),                         # all caps single word — "NOTES", "PN"
    re.compile(r"^[A-Z]\s*-\s*[A-Z]$"),              # section labels "A-A", "B-B"
    re.compile(r"^SECTION\b", re.I),                 # section headers
    re.compile(r"^SCALE\b", re.I),                   # scale labels
    re.compile(r"^DETAIL\b", re.I),                  # detail labels
    re.compile(r"^SHEET\b", re.I),
    re.compile(r"^DWG\b", re.I),                     # drawing number
    re.compile(r"^REV\b", re.I),                     # revision marker
    # Dates — common in title blocks "11/12/2005", "2026-06-25", "12-NOV-2005"
    re.compile(r"^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b"),
    re.compile(r"^\d{4}[/-]\d{1,2}[/-]\d{1,2}\b"),
    re.compile(r"^\d{1,2}[/-][A-Z]{3}[/-]\d{2,4}\b", re.I),
]

# Title-block / non-dim keywords. Anywhere in the string, even mid-word
# (so "GPEMP0100044" matches via the GPEMP prefix even with no boundary).
_TITLE_KEYWORDS = re.compile(
    r"(TUBE|ASSEMBLY|ASSY|DRAWING|RELEASE|REVISION|"
    r"ENGINEERING|APPROVED|CHECKED|"
    r"MATERIAL|FINISH|TREATMENT|HEAT|PROCESS|"
    r"NEXT\s+USED|USED\s+ON|TITLE|"
    r"UNLESS|OTHERWISE|SPECIFIED|"
    r"DIMENSIONS|TOLERANCES|"
    r"GPEMP|GPE-|PIP\s|STM6|CONTRACT|FRM)",
    re.I,
)


def should_skip(text: str) -> bool:
    """True if text is clearly not a dimensional callout."""
    if not text:
        return True
    t = text.strip()

    # GD&T glyphs always pass — they're symbols, not numbers
    if any(c in _GDT_GLYPHS for c in t):
        return False

    # Apply skip patterns
    for pat in _SKIP_PATTERNS:
        if pat.match(t):
            return True

    # Must contain at least one digit
    if not re.search(r"\d", t):
        return True

    # Title-block keywords anywhere in the string (merged garbage often
    # contains "TUBE", "ASSEMBLY", drawing-number fragments like "GPEMP" etc.)
    if _TITLE_KEYWORDS.search(t):
        return True

    # Too many letters relative to length = wordy text mistakenly merged with
    # a dim. A real dim like "1.500 ±0.005 in" has ~30-50% letters; merged
    # garbage like "(1.50) (301) (G01) 2 TUBE TUBE ASS" has way more.
    letters = sum(1 for c in t if c.isalpha())
    digits = sum(1 for c in t if c.isdigit())
    if letters > 6 and digits > 0 and letters / max(len(t), 1) > 0.40:
        return True

    # Standalone integer 1-3 chars with no decimal, no unit, no operator → zone label
    # e.g. "4", "7", "48", "203", "540" — usually zone markers
    if re.fullmatch(r"\d{1,3}", t):
        return True

    # Single short text in parens with no decimal → likely zone "(208)", "(540)"
    paren_match = re.fullmatch(r"[\(\[\{]\s*(\d+(?:\.\d+)?)\s*[\)\]\}]", t)
    if paren_match:
        inner = paren_match.group(1)
        if "." not in inner and len(inner) <= 3:
            return True  # "(208)" type — skip
        # "(1.50)" → don't skip, it's a reference dim

    # Length cap — real dim strings are short. Anything over ~50 chars is
    # almost certainly merged garbage (the long source text we saw was
    # "11/12/2005 LM_J55_SIZE.FRM Drawi...").
    if len(t) > 50:
        return True

    # Reject if text has 3+ parenthesized groups (merged title clutter like
    # "(1.50) (301) (G01)") OR mixed bracket types ("(201) 20 [22 |] ...")
    open_brackets = len(re.findall(r"[\(\[\{]", t))
    if open_brackets >= 3:
        return True
    # Mixed bracket types = different semantic groups jammed together
    has_paren = "(" in t
    has_square = "[" in t
    if has_paren and has_square:
        return True

    # Multiple multiplier prefixes ("3X 3X.", "2X 2X") = title fragments
    if len(re.findall(r"\b\d+\s*[xX]\b", t)) >= 2:
        return True

    return False


def detect_reference(text: str) -> bool:
    """A dimension in parens like '(1.250)' is a reference dim — no tol."""
    return bool(re.fullmatch(r"\s*[\(\[\{].*[\)\]\}]\s*", text or ""))


# ---------- Prompt ----------

SYSTEM_PROMPT = """You are an aerospace inspector AI. Extract structured fields from a single dimensional callout on an engineering drawing.

Reply with ONE JSON object only. No markdown, no commentary.

Schema:
{"char_type": "linear|diameter|radius|angle|gdt|surface_finish|skip",
 "nominal": number or null,
 "upper_tolerance": number or null,
 "lower_tolerance": number or null,
 "unit": "in"|"mm"|"deg"|"μin"|"μm"|null,
 "gdt_symbol": string or null,
 "gdt_datums": [list of letters],
 "finish_value": string or null,
 "finish_unit": string or null}

Strict rules:
- "Ø1.250 ±0.005" → diameter, nominal 1.250, upper 0.005, lower 0.005, unit "in"
- "R0.125 +0.010/-0.000" → radius, nominal 0.125, upper 0.010, lower 0.000
- "45° ±0.5°" → angle, nominal 45, upper 0.5, lower 0.5, unit "deg"
- "⊥ 0.005 A" → gdt, gdt_symbol "⊥", upper_tolerance 0.005, gdt_datums ["A"]
- "63 Ra μin" → surface_finish, finish_value "63", finish_unit "Ra μin"
- "1.500 ±0.005 in" → linear

CRITICAL — return "skip" for:
- Page numbers like "1/1", "2/6"
- Quantity prefixes like "2X", "4X"
- Standalone short integers like "4", "7", "208" — these are usually zone markers
- Title block fragments like "GPEMP0100044"
- Section/view labels like "SECTION A-A", "SCALE 1/1"
- Anything without a decimal point AND not a clear measurement

Reference dimensions: parentheses around a value like "(1.250)" → this IS a dim,
char_type "linear", nominal 1.250, but upper_tolerance and lower_tolerance both 0
(reference = no tolerance check).

If unsure → return char_type "skip" with nulls."""


def _build_user_prompt(text: str) -> str:
    return f"Callout text:\n{text.strip()}\n\nJSON:"


def _extract_json(raw: str) -> dict[str, Any] | None:
    if not raw:
        return None
    raw = re.sub(r"```(?:json)?", "", raw).strip("` \n")
    match = re.search(r"\{[\s\S]*\}", raw)
    if not match:
        return None
    candidate = match.group(0)
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        cleaned = re.sub(r",(\s*[}\]])", r"\1", candidate)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            return None


def _score(parsed: dict[str, Any], original_text: str, is_ref: bool) -> float:
    """Stricter confidence — prefer well-formed dimensional results."""
    ctype = parsed.get("char_type")

    if ctype == "skip":
        return 0.0

    if ctype not in {"linear", "diameter", "radius", "angle", "gdt", "surface_finish"}:
        return 0.1

    score = 0.4

    has_nominal = parsed.get("nominal") is not None
    has_upper = parsed.get("upper_tolerance") is not None
    has_unit = parsed.get("unit") is not None
    has_finish = parsed.get("finish_value") is not None
    has_gdt_sym = parsed.get("gdt_symbol") is not None

    # Linear/diameter/radius/angle should have nominal + unit
    if ctype in {"linear", "diameter", "radius", "angle"}:
        if has_nominal:
            score += 0.25
        if has_unit:
            score += 0.10
        if has_upper:
            score += 0.10
        # Penalize if original text has no decimal point (likely zone marker AI mislabeled)
        if "." not in original_text and not is_ref:
            score -= 0.30
        # Penalize length 1 nominals (single digit dims are rare)
        if has_nominal and len(str(int(parsed["nominal"]))) == 1 and "." not in original_text:
            score -= 0.20

    if ctype == "gdt":
        if has_gdt_sym:
            score += 0.30
        if has_upper:
            score += 0.20

    if ctype == "surface_finish":
        if has_finish:
            score += 0.40

    # Reference dim bonus — parens means inspector trusts it as a callout
    if is_ref and has_nominal:
        score += 0.10

    return max(0.0, min(1.0, score))


def classify(text: str) -> dict[str, Any]:
    if not text or not text.strip():
        return _fallback_skip(text, "empty")

    is_ref = detect_reference(text)

    # Hard pre-filter — never send obvious junk to LLM
    if should_skip(text):
        return _fallback_skip(text, "filtered")

    try:
        payload = {
            "model": OLLAMA_MODEL,
            "prompt": _build_user_prompt(text),
            "system": SYSTEM_PROMPT,
            "stream": False,
            "options": {"temperature": 0.0, "num_predict": 200},
        }
        with httpx.Client(timeout=OLLAMA_TIMEOUT) as client:
            r = client.post(f"{OLLAMA_HOST}/api/generate", json=payload)
        r.raise_for_status()
        raw = r.json().get("response", "")
    except Exception as e:  # noqa: BLE001
        log.warning("Ollama call failed: %s", e)
        return _fallback_skip(text, f"ollama error: {e}")

    parsed = _extract_json(raw)
    if not parsed:
        log.warning("Could not parse JSON from Ollama response: %r", raw[:200])
        return _fallback_skip(text, "unparseable")

    ctype = parsed.get("char_type") or "skip"

    # Reference dim: force tolerance to 0
    upper = _to_float(parsed.get("upper_tolerance"))
    lower = _to_float(parsed.get("lower_tolerance"))
    if is_ref:
        upper = 0.0
        lower = 0.0

    result = {
        "char_type": ctype,
        "nominal": _to_float(parsed.get("nominal")),
        "upper_tolerance": upper,
        "lower_tolerance": lower,
        "unit": parsed.get("unit"),
        "gdt_symbol": parsed.get("gdt_symbol"),
        "gdt_datums": parsed.get("gdt_datums") or [],
        "finish_value": parsed.get("finish_value"),
        "finish_unit": parsed.get("finish_unit"),
        "is_reference": is_ref,
        "confidence": 0.0,
        "source_text": text,
    }
    result["confidence"] = _score(parsed, text, is_ref)
    return result


def _fallback_skip(text: str, reason: str) -> dict[str, Any]:
    return {
        "char_type": "skip",
        "nominal": None,
        "upper_tolerance": None,
        "lower_tolerance": None,
        "unit": None,
        "gdt_symbol": None,
        "gdt_datums": [],
        "finish_value": None,
        "finish_unit": None,
        "is_reference": False,
        "confidence": 0.0,
        "source_text": text,
        "skip_reason": reason,
    }


def _to_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def health() -> dict[str, Any]:
    try:
        with httpx.Client(timeout=5) as client:
            r = client.get(f"{OLLAMA_HOST}/api/tags")
        r.raise_for_status()
        models = [m.get("name") for m in r.json().get("models", [])]
        return {
            "ok": True,
            "host": OLLAMA_HOST,
            "model": OLLAMA_MODEL,
            "model_loaded": OLLAMA_MODEL in models,
            "available_models": models,
        }
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "host": OLLAMA_HOST, "error": str(e)}
