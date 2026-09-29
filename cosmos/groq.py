"""Optional Groq chat-based semantic assessment. Technical safety always lives in engine.py."""

from __future__ import annotations

import json
import re
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_MODEL = "llama-3.3-70b-versatile"


class GroqUnavailable(Exception):
    """The optional provider failed; the deterministic pipeline can continue."""


def _parse_json(text: str) -> dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group())
        raise GroqUnavailable("Groq did not return usable structured output") from None


def assess_pairs(pairs: list[dict[str, Any]], api_key: str, model: str = DEFAULT_MODEL) -> dict[str, dict[str, Any]]:
    """Send a small, explicitly selected batch; return only validated, bounded model output."""
    if not api_key or not pairs:
        return {}
    items = [{"id": str(pair["id"]), "left": pair["left"][:400], "right": pair["right"][:400]} for pair in pairs[:8]]
    instructions = (
        "You assist industrial material master-data reviewers. Compare material descriptions. "
        "A different bearing designation, size, grade, material, core count, or pressure class "
        "means NOT equivalent. Missing specifications are uncertain, not evidence of equality. "
        "Return ONLY a JSON object with key matches, an array of objects: "
        '{"id":"same input id","equivalent":true or false,"semantic_similarity":0.0 to 1.0,'
        '"reason":"one short, specific sentence"}. Return one object per input pair. '
        "Do not invent facts or codes."
    )
    payload = {
        "model": model,
        "temperature": 0,
        "max_tokens": 1100,
        "messages": [
            {"role": "system", "content": instructions},
            {"role": "user", "content": json.dumps({"pairs": items}, ensure_ascii=False)},
        ],
    }
    req = Request(
        GROQ_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(req, timeout=18) as response:
            data = json.load(response)
        content = data["choices"][0]["message"]["content"]
        parsed = _parse_json(content)
        if not isinstance(parsed, dict) or not isinstance(parsed.get("matches"), list):
            raise GroqUnavailable("Groq returned no usable comparisons; continued with local matching")
    except GroqUnavailable:
        raise
    except (HTTPError, URLError, TimeoutError, KeyError, IndexError, ValueError, OSError, TypeError) as exc:
        if isinstance(exc, HTTPError):
            message = f"Groq returned HTTP {exc.code}; continued with local matching"
        else:
            message = "Groq was unavailable; continued with local matching"
        raise GroqUnavailable(message) from exc

    valid_ids = {item["id"] for item in items}
    result: dict[str, dict[str, Any]] = {}
    for match in parsed.get("matches", []):
        if not isinstance(match, dict) or str(match.get("id")) not in valid_ids:
            continue
        try:
            similarity = float(match["semantic_similarity"])
        except (ValueError, TypeError, KeyError):
            continue
        if not 0 <= similarity <= 1 or not isinstance(match.get("equivalent"), bool):
            continue
        result[str(match["id"])] = {
            "semantic_similarity": similarity,
            "equivalent": match["equivalent"],
            "reason": str(match.get("reason", ""))[:240],
        }
    if not result:
        raise GroqUnavailable("Groq returned no usable comparisons; continued with local matching")
    return result
