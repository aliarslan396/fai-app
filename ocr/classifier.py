"""
FAI characteristic classifier — Ollama + local LLM.

Takes a single OCR text block (e.g. "1.500 ±0.005 in" or "⊥ 0.005 A")
and asks the local Ollama model to extract structured fields.

Model: env OLLAMA_MODEL (default llama3.2:3b on 4 GB droplet;
swap to "mistral" when droplet upgraded to ≥16 GB).

Per FAI Manager doc section 2.3: NO cloud AI. ITAR-safe. Air-gapped.

Output JSON shape:
{
  "char_type": "linear" | "diameter" | "radius" | "angle" | "gdt" | "surface_finish" | "note",
  "nominal": float | null,
  "upper_tolerance": float | null,
  "lower_tolerance": float | null,
  "unit": str | null,                # in | mm | deg | μin | μm | null
  "gdt_symbol": str | null,          # ⊕ ⊥ ⏥ etc.
  "gdt_datums": [str],               # ["A", "B", "C"]
  "finish_value": str | null,
  "finish_unit": str | null,         # "Ra μin", "Ra μm", etc.
  "confidence": float                # 0.0 - 1.0
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

# Few-shot prompt — keep terse for small models.
SYSTEM_PROMPT = """You are an aerospace inspector AI. Extract structured fields from a single dimensional callout on an engineering drawing.

Reply with ONE JSON object only. No markdown, no commentary.

Schema:
{"char_type": "linear|diameter|radius|angle|gdt|surface_finish|note",
 "nominal": number or null,
 "upper_tolerance": number or null,
 "lower_tolerance": number or null,
 "unit": "in"|"mm"|"deg"|"μin"|"μm"|null,
 "gdt_symbol": string or null,
 "gdt_datums": [list of letters],
 "finish_value": string or null,
 "finish_unit": string or null}

Rules:
- "Ø1.250 ±0.005" → diameter, nominal 1.250, upper 0.005, lower 0.005, unit "in"
- "R0.125 +0.010/-0.000" → radius, nominal 0.125, upper 0.010, lower 0.000
- "45° ±0.5°" → angle, nominal 45, upper 0.5, lower 0.5, unit "deg"
- "⊥ 0.005 A" → gdt, gdt_symbol "⊥", upper_tolerance 0.005, gdt_datums ["A"]
- "63 Ra μin" → surface_finish, finish_value "63", finish_unit "Ra μin"
- Plain number "1.500 ±0.005" → linear
- Symmetric tolerance "±X" means upper = lower = X
- Unknown → char_type "note", other fields null"""


def _build_user_prompt(text: str) -> str:
    return f"Callout text:\n{text.strip()}\n\nJSON:"


def _extract_json(raw: str) -> dict[str, Any] | None:
    """LLMs sometimes wrap output in prose / fences. Pull the first {...} block."""
    if not raw:
        return None
    # Strip code fences
    raw = re.sub(r"```(?:json)?", "", raw).strip("` \n")
    # Greedy first JSON object
    match = re.search(r"\{[\s\S]*\}", raw)
    if not match:
        return None
    candidate = match.group(0)
    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        # Sometimes the model leaves trailing commas — try a light repair
        cleaned = re.sub(r",(\s*[}\]])", r"\1", candidate)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            return None


def _score(parsed: dict[str, Any], original_text: str) -> float:
    """Heuristic confidence — model rarely gives one we can trust."""
    score = 0.5
    if parsed.get("char_type") in {"linear", "diameter", "radius", "angle", "gdt", "surface_finish"}:
        score += 0.2
    if parsed.get("nominal") is not None or parsed.get("finish_value"):
        score += 0.1
    if parsed.get("upper_tolerance") is not None:
        score += 0.1
    # Penalize if no numbers detected but original text has digits
    if any(c.isdigit() for c in original_text) and parsed.get("nominal") is None \
            and parsed.get("upper_tolerance") is None \
            and parsed.get("finish_value") is None:
        score -= 0.3
    return max(0.0, min(1.0, score))


def classify(text: str) -> dict[str, Any]:
    """
    Returns a normalized characteristic dict. Always returns something —
    falls back to {"char_type": "note", ...} on any error.
    """
    if not text or not text.strip():
        return _fallback_note(text, "empty input")

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
        return _fallback_note(text, f"ollama error: {e}")

    parsed = _extract_json(raw)
    if not parsed:
        log.warning("Could not parse JSON from Ollama response: %r", raw[:200])
        return _fallback_note(text, "unparseable response")

    # Normalize fields
    return {
        "char_type": parsed.get("char_type") or "note",
        "nominal": _to_float(parsed.get("nominal")),
        "upper_tolerance": _to_float(parsed.get("upper_tolerance")),
        "lower_tolerance": _to_float(parsed.get("lower_tolerance")),
        "unit": parsed.get("unit"),
        "gdt_symbol": parsed.get("gdt_symbol"),
        "gdt_datums": parsed.get("gdt_datums") or [],
        "finish_value": parsed.get("finish_value"),
        "finish_unit": parsed.get("finish_unit"),
        "confidence": _score(parsed, text),
        "source_text": text,
    }


def _fallback_note(text: str, reason: str) -> dict[str, Any]:
    return {
        "char_type": "note",
        "nominal": None,
        "upper_tolerance": None,
        "lower_tolerance": None,
        "unit": None,
        "gdt_symbol": None,
        "gdt_datums": [],
        "finish_value": None,
        "finish_unit": None,
        "confidence": 0.0,
        "source_text": text,
        "fallback_reason": reason,
    }


def _to_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def health() -> dict[str, Any]:
    """Probe Ollama + check model present."""
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
