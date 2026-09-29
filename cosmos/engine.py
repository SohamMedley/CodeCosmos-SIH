"""Conservative, explainable material matching. No model is allowed to override a spec conflict."""

from __future__ import annotations

from collections import Counter
from difflib import SequenceMatcher
import math
import re
import unicodedata
from typing import Any

ATTRIBUTE_LABELS = {
    "family": "Material family",
    "bearing_code": "Bearing designation",
    "bearing_seal": "Bearing seal/shield",
    "bearing_clearance": "Bearing clearance",
    "thread_mm": "Thread diameter",
    "length_mm": "Length",
    "grade": "Grade",
    "material": "Material",
    "dn": "Nominal diameter",
    "pn": "Pressure class",
    "schedule": "Pipe schedule",
    "area_mm2": "Cross-section",
    "cores": "Core count",
}
WEIGHTS = {
    "family": 1.3,
    "bearing_code": 3.2,
    "bearing_seal": 2.5,
    "bearing_clearance": 2.0,
    "thread_mm": 2.0,
    "length_mm": 2.3,
    "grade": 1.8,
    "material": 1.8,
    "dn": 2.2,
    "pn": 2.3,
    "schedule": 2.2,
    "area_mm2": 2.8,
    "cores": 1.8,
}
SPEC_KEYS = tuple(k for k in WEIGHTS if k != "family")
BRANDS = {"SKF", "NSK", "FAG", "NTN", "TIMKEN"}
STOP_WORDS = {"the", "for", "of", "and", "industrial", "standard", "item", "no", "type", "with", "x"}


def _clean_number(number: str | float) -> int | float:
    value = float(number)
    return int(value) if value.is_integer() else round(value, 4)


def _to_mm(number: str, unit: str | None) -> int | float:
    factor = {"MM": 1, "CM": 10, "M": 1000}.get((unit or "MM").upper(), 1)
    return _clean_number(float(number) * factor)


def extract_attributes(description: str) -> dict[str, Any]:
    """Extract only explicitly stated engineering facts; absent values remain unknown."""
    text = unicodedata.normalize("NFKC", description).upper().replace("×", " X ")
    text = text.replace("Ø", " DIA ").replace("²", "2")
    attrs: dict[str, Any] = {}

    for word, family in (
        (r"\b(?:BEARINGS?|BRG|DGBB)\b", "bearing"),
        (r"\b(?:BOLTS?|HEX\s+BOLTS?)\b", "bolt"),
        (r"\b(?:PIPES?|TUBES?)\b", "pipe"),
        (r"\b(?:CABLES?|WIRES?)\b", "cable"),
        (r"\bFLANGES?\b", "flange"),
        (r"\bNUTS?\b", "nut"),
        (r"\bVALVES?\b", "valve"),
        (r"\bWASHERS?\b", "washer"),
    ):
        if re.search(word, text):
            attrs["family"] = family
            break

    if re.search(r"\b(?:STAINLESS\s+STEEL|S\.?S\.?)\b", text):
        attrs["material"] = "stainless steel"
    elif re.search(r"\b(?:MILD\s+STEEL|M\.?S\.?)\b", text):
        attrs["material"] = "mild steel"
    elif re.search(r"\bCARBON\s+STEEL\b", text):
        attrs["material"] = "carbon steel"
    elif re.search(r"\bCOPPER\b", text):
        attrs["material"] = "copper"
    elif re.search(r"\bSTEEL\b", text):
        attrs["material"] = "steel (unspecified)"

    if attrs.get("family") == "bearing":
        # The designation is technical evidence, not an arbitrary number elsewhere in a record.
        match = re.search(r"(?<![A-Z0-9])([0-9]{4,5})(?![A-Z0-9])", text)
        if match:
            attrs["bearing_code"] = match.group(1)
        seal = re.search(r"\b(2RS|RS|ZZ|2Z|Z)\b", text)
        if seal:
            attrs["bearing_seal"] = seal.group(1)
        clearance = re.search(r"\b(C[2345])\b", text)
        if clearance:
            attrs["bearing_clearance"] = clearance.group(1)

    thread = re.search(r"\bM\s*(\d{1,3}(?:\.\d+)?)(?=\s*[X*]|\b)", text)
    if thread and attrs.get("family") in {"bolt", "nut", "washer"}:
        attrs["thread_mm"] = _clean_number(thread.group(1))

    if attrs.get("family") == "bolt":
        length = re.search(r"(?:\bM\s*\d{1,3}(?:\.\d+)?\s*)[X*]\s*(\d+(?:\.\d+)?)\s*(MM|CM|M)?\b", text)
        if not length:
            length = re.search(r"\b(?:LENGTH|LONG|LG)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(MM|CM|M)\b", text)
        if length:
            attrs["length_mm"] = _to_mm(length.group(1), length.group(2))
        grade = re.search(r"\b(?:GRADE|GR\.?|CLASS)\s*[:=]?\s*(\d+(?:\.\d+)?)\b", text)
        if grade:
            attrs["grade"] = grade.group(1)

    dn = re.search(r"\bDN\s*[-:]?\s*(\d+(?:\.\d+)?)\b", text)
    if dn:
        attrs["dn"] = _clean_number(dn.group(1))
    pn = re.search(r"\bPN\s*[-:]?\s*(\d+(?:\.\d+)?)\b", text)
    if pn:
        attrs["pn"] = _clean_number(pn.group(1))
    if attrs.get("family") == "pipe":
        schedule = re.search(r"\b(?:SCH\.?|SCHEDULE)\s*(\d{1,3}[A-Z]?)\b", text)
        if schedule:
            attrs["schedule"] = schedule.group(1)

    if attrs.get("family") == "cable":
        area = re.search(r"\b(\d+(?:\.\d+)?)\s*(?:SQ\.?\s*MM|SQMM|MM\s*(?:2|\^2))\b", text)
        if area:
            attrs["area_mm2"] = _clean_number(area.group(1))
        cores = re.search(r"\b(\d+)\s*[- ]?\s*CORES?\b", text)
        if cores:
            attrs["cores"] = int(cores.group(1))

    brand = next((brand for brand in BRANDS if re.search(rf"\b{brand}\b", text)), None)
    if brand:
        attrs["manufacturer"] = brand
    return attrs


def normalize(description: str) -> str:
    text = unicodedata.normalize("NFKC", description).lower().replace("×", " x ")
    text = text.replace("²", "2").replace("ø", " diameter ")
    for pattern, replacement in (
        (r"\bdgbb\b", "deep groove ball bearing"),
        (r"\bbrg\b", "bearing"),
        (r"\bss\b", "stainless steel"),
        (r"\bms\b", "mild steel"),
        (r"\bhex\b", "hexagonal"),
        (r"\bgr\.?\b", "grade"),
        (r"\bbearings\b", "bearing"),
        (r"\bbolts\b", "bolt"),
        (r"\bpipes\b", "pipe"),
        (r"\bcables\b", "cable"),
        (r"\bcores\b", "core"),
        (r"\bsq\.?\s*mm\b|\bmm\s*\^?2\b", "mm2"),
    ):
        text = re.sub(pattern, replacement, text)
    for brand in BRANDS:
        text = re.sub(rf"\b{brand.lower()}\b", " ", text)
    text = re.sub(r"\b(m\s*\d+(?:\.\d+)?)\s*[x*]\s*(\d)", r"\1 x \2", text)

    def standardize_length(match: re.Match[str]) -> str:
        value = _to_mm(match.group(1), match.group(2))
        return f"{value} mm"

    text = re.sub(r"\b(\d+(?:\.\d+)?)\s*(mm|cm|m)\b", standardize_length, text)
    text = re.sub(r"[^a-z0-9.]+", " ", text)
    return " ".join(text.split())


def _cosine(left: Counter[str], right: Counter[str]) -> float:
    dot = sum(value * right.get(key, 0) for key, value in left.items())
    norm = math.sqrt(sum(value * value for value in left.values()) * sum(value * value for value in right.values()))
    return dot / norm if norm else 0.0


def vector_similarity(left: str, right: str) -> float:
    """Small, dependency-free synonym-aware sparse vector; not a pretrained embedding."""
    l_tokens = Counter(t for t in re.findall(r"[a-z0-9]+(?:\.[0-9]+)?", left) if t not in STOP_WORDS)
    r_tokens = Counter(t for t in re.findall(r"[a-z0-9]+(?:\.[0-9]+)?", right) if t not in STOP_WORDS)
    l_chars = Counter(left.replace(" ", "")[i:i + 3] for i in range(max(0, len(left.replace(" ", "")) - 2)))
    r_chars = Counter(right.replace(" ", "")[i:i + 3] for i in range(max(0, len(right.replace(" ", "")) - 2)))
    return 0.78 * _cosine(l_tokens, r_tokens) + 0.22 * _cosine(l_chars, r_chars)


def _equal(a: Any, b: Any) -> bool:
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return math.isclose(a, b, abs_tol=0.02, rel_tol=0)
    return a == b


def _ambiguous_steel(a: Any, b: Any) -> bool:
    return "steel (unspecified)" in (a, b) and a != b and {a, b}.issubset(
        {"steel (unspecified)", "stainless steel", "mild steel", "carbon steel"}
    )


def _display_value(key: str, value: Any) -> str:
    if key in {"thread_mm", "length_mm"}:
        return f"{value} mm"
    if key == "area_mm2":
        return f"{value} mm²"
    if key == "dn":
        return f"DN {value}"
    if key == "pn":
        return f"PN {value}"
    return str(value)


def compare(left: str, right: str, ai: dict[str, Any] | None = None) -> dict[str, Any]:
    """Score a pair and expose every supporting and conflicting signal."""
    a, b = extract_attributes(left), extract_attributes(right)
    norm_a, norm_b = normalize(left), normalize(right)
    vector = vector_similarity(norm_a, norm_b)
    sorted_a, sorted_b = " ".join(sorted(norm_a.split())), " ".join(sorted(norm_b.split()))
    fuzzy = max(SequenceMatcher(None, norm_a, norm_b).ratio(), SequenceMatcher(None, sorted_a, sorted_b).ratio())

    conflicts: list[str] = []
    matched: list[str] = []
    warnings: list[str] = []
    shared_weight = union_weight = 0.0
    shared_spec_keys: set[str] = set()
    missing_spec = False

    for key, weight in WEIGHTS.items():
        av, bv = a.get(key), b.get(key)
        if av is None and bv is None:
            continue
        union_weight += weight
        if av is None or bv is None:
            if key != "family":
                missing_spec = True
                warnings.append(f"{ATTRIBUTE_LABELS[key]} is missing from one description")
            continue
        if key == "material" and _ambiguous_steel(av, bv):
            warnings.append("Steel grade is unspecified in one description")
            continue
        if _equal(av, bv):
            shared_weight += weight
            matched.append(f"{ATTRIBUTE_LABELS[key]}: {_display_value(key, av)}")
            if key in SPEC_KEYS:
                shared_spec_keys.add(key)
        else:
            conflicts.append(f"{ATTRIBUTE_LABELS[key]} differs: {_display_value(key, av)} vs {_display_value(key, bv)}")

    if a.get("manufacturer") or b.get("manufacturer"):
        if a.get("manufacturer") != b.get("manufacturer"):
            warnings.append("Manufacturer differs or is unspecified; verify interchangeability")

    technical = shared_weight / union_weight if union_weight else 0.0
    anchor = bool(
        "bearing_code" in shared_spec_keys
        or {"thread_mm", "length_mm"}.issubset(shared_spec_keys)
        or {"dn", "pn"}.issubset(shared_spec_keys)
        or {"area_mm2", "cores"}.issubset(shared_spec_keys)
    )
    score = 0.28 * vector + 0.14 * fuzzy + 0.58 * technical + (0.08 if anchor else 0)
    if not shared_spec_keys:
        score = min(score, 0.77)
    if missing_spec:
        score = min(score, 0.82)
    if any("Manufacturer" in item for item in warnings):
        score = min(score, 0.89)
    if ai:
        try:
            ai_similarity = min(1.0, max(0.0, float(ai.get("semantic_similarity", 0))))
        except (ValueError, TypeError):
            ai_similarity = 0.0
        if ai.get("equivalent") is False:
            warnings.append("Groq disagrees with a match; expert verification required")
            score = min(score, 0.74)
        elif ai.get("equivalent") is True and not conflicts:
            score = 0.84 * score + 0.16 * ai_similarity
            if missing_spec:
                score = min(score, 0.82)
            if any("Manufacturer" in item for item in warnings):
                score = min(score, 0.89)
    if conflicts:
        score = min(score, 0.29)

    score = round(min(0.99, max(0, score)), 4)
    eligible = not conflicts and score >= 0.61 and (bool(shared_spec_keys) or vector >= 0.82)
    tier = "blocked" if conflicts else "fast_track" if score >= 0.9 and not warnings else "review"
    if not eligible and not conflicts:
        tier = "no_match"

    return {
        "score": score,
        "tier": tier,
        "eligible": eligible,
        "normalized": {"left": norm_a, "right": norm_b},
        "attributes": {"left": a, "right": b},
        "signals": {
            "vector": round(vector, 4),
            "fuzzy": round(fuzzy, 4),
            "technical": round(technical, 4),
            "groq": round(float(ai.get("semantic_similarity", 0)), 4) if ai else None,
        },
        "matched": matched,
        "warnings": warnings,
        "conflicts": conflicts,
        "ai_reason": str(ai.get("reason", ""))[:240] if ai else None,
        "engine": "groq_assisted" if ai else "local",
    }


def has_known_conflict(left: dict[str, Any], right: dict[str, Any]) -> bool:
    """Cheap blocking before full comparison. Unknown values never count as a conflict."""
    for key in WEIGHTS:
        a, b = left.get(key), right.get(key)
        if a is None or b is None:
            continue
        if key == "material" and _ambiguous_steel(a, b):
            continue
        if not _equal(a, b):
            return True
    return False


def best_reference(left: str, right: str, references: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Recommend a catalog code only when BOTH records agree with its technical facts."""
    left_attrs, right_attrs = extract_attributes(left), extract_attributes(right)
    left_norm, right_norm = normalize(left), normalize(right)
    shortlist: list[tuple[float, dict[str, Any]]] = []
    for ref in references:
        attrs = ref.get("attributes")
        if attrs is None:
            attrs = extract_attributes(ref["description"])
        if has_known_conflict(left_attrs, attrs) or has_known_conflict(right_attrs, attrs):
            continue
        ref_norm = ref.get("normalized") or normalize(ref["description"])
        similarity = min(vector_similarity(left_norm, ref_norm), vector_similarity(right_norm, ref_norm))
        shortlist.append((similarity, ref))
    # Limit full, expensive comparisons for large imported catalogs; strong technical blockers
    # have already been applied to all entries, and the best textual fits are evaluated first.
    shortlist.sort(key=lambda item: item[0], reverse=True)
    best: dict[str, Any] | None = None
    for _, ref in shortlist[:30]:
        a = compare(left, ref["description"])
        b = compare(right, ref["description"])
        if a["conflicts"] or b["conflicts"]:
            continue
        value = min(a["score"], b["score"])
        if value >= 0.7 and (best is None or value > best["score"]):
            best = {"code": ref["code"], "score": round(value, 4), "is_demo": bool(ref.get("is_demo", False))}
    return best
