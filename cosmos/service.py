"""Candidate generation, optional Groq enrichment, and reference recommendation."""

from __future__ import annotations

import json
import sqlite3
from typing import Any

from .engine import best_reference, compare, has_known_conflict
from .groq import GroqUnavailable, assess_pairs, DEFAULT_MODEL

MAX_CANDIDATES = 180
MAX_GROQ_PAIRS = 8
MAX_COMPARISONS_PER_RECORD = 24


def analyze(db: sqlite3.Connection, api_key: str = "", model: str = DEFAULT_MODEL, mode: str = "local") -> dict[str, Any]:
    records = [dict(row) for row in db.execute("SELECT * FROM records ORDER BY id")]
    for record in records:
        record["parsed_attributes"] = json.loads(record["attributes_json"])
    refs = [dict(row) for row in db.execute("SELECT code, description, normalized, attributes_json, is_demo FROM reference_catalog")]
    for ref in refs:
        ref["attributes"] = json.loads(ref["attributes_json"])
    pairs: list[tuple[dict[str, Any], dict[str, Any], dict[str, Any]]] = []
    considered = 0
    comparison_limited = False
    for index, left in enumerate(records):
        considered_for_left = 0
        for right in records[index + 1:]:
            if has_known_conflict(left["parsed_attributes"], right["parsed_attributes"]):
                continue
            # This is a bounded interactive prototype, not an unbounded quadratic batch job.
            if considered_for_left >= MAX_COMPARISONS_PER_RECORD:
                comparison_limited = True
                break
            considered += 1
            considered_for_left += 1
            result = compare(left["description"], right["description"])
            if result["eligible"]:
                pairs.append((left, right, result))

    pairs.sort(key=lambda item: item[2]["score"], reverse=True)
    candidate_limited = len(pairs) > MAX_CANDIDATES
    pairs = pairs[:MAX_CANDIDATES]
    ai_results: dict[str, dict[str, Any]] = {}
    warning: str | None = None
    if api_key and pairs:
        # Spend the small Groq budget on both strong candidates and uncertain cases,
        # rather than using every model call to reconfirm obvious high-score pairs.
        selected = pairs[:MAX_GROQ_PAIRS // 2]
        selected_ids = {(a["id"], b["id"]) for a, b, _ in selected}
        for item in reversed(pairs):
            if len(selected) >= MAX_GROQ_PAIRS:
                break
            key = (item[0]["id"], item[1]["id"])
            if key not in selected_ids:
                selected.append(item)
                selected_ids.add(key)
        payload = [
            {"id": f"{a['id']}:{b['id']}", "left": a["description"], "right": b["description"]}
            for a, b, _ in selected
        ]
        try:
            ai_results = assess_pairs(payload, api_key, model)
        except GroqUnavailable as exc:
            warning = str(exc)

    enriched = 0
    for left, right, result in pairs:
        pair_key = f"{left['id']}:{right['id']}"
        if pair_key in ai_results:
            result = compare(left["description"], right["description"], ai_results[pair_key])
            enriched += 1
        reference = best_reference(left["description"], right["description"], refs)
        db.execute(
            """INSERT INTO candidates
               (left_id, right_id, score, tier, signals_json, matched_json, warnings_json, ai_reason, engine, suggested_code)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(left_id, right_id) DO UPDATE SET
               score=excluded.score, tier=excluded.tier, signals_json=excluded.signals_json,
               matched_json=excluded.matched_json, warnings_json=excluded.warnings_json,
               ai_reason=excluded.ai_reason, engine=excluded.engine, suggested_code=excluded.suggested_code""",
            (left["id"], right["id"], result["score"], result["tier"], json.dumps(result["signals"]),
             json.dumps(result["matched"]), json.dumps(result["warnings"]), result["ai_reason"],
             result["engine"], reference["code"] if reference else None),
        )

    actual_mode = "groq_assisted" if enriched else "local"
    if comparison_limited or candidate_limited:
        limit_note = "Prototype shortlist is capped (24 comparisons per record, 180 candidates); use smaller batches for full coverage"
        warning = f"{warning}; {limit_note}" if warning else limit_note
    cursor = db.execute(
        "INSERT INTO analysis_runs (considered, candidates, ai_enriched, mode, warning) VALUES (?, ?, ?, ?, ?)",
        (considered, len(pairs), enriched, mode if mode == "demo" else actual_mode, warning),
    )
    db.commit()
    return {
        "id": cursor.lastrowid, "considered": considered, "candidates": len(pairs),
        "ai_enriched": enriched, "mode": actual_mode, "warning": warning,
        "limited": comparison_limited or candidate_limited,
    }


def refresh_recommendations(db: sqlite3.Connection) -> None:
    refs = [dict(row) for row in db.execute("SELECT code, description, normalized, attributes_json, is_demo FROM reference_catalog")]
    for ref in refs:
        ref["attributes"] = json.loads(ref["attributes_json"])
    rows = db.execute(
        """SELECT c.id, a.description AS left_description, b.description AS right_description
           FROM candidates c JOIN records a ON c.left_id=a.id JOIN records b ON c.right_id=b.id"""
    ).fetchall()
    for row in rows:
        match = best_reference(row["left_description"], row["right_description"], refs)
        db.execute("UPDATE candidates SET suggested_code=? WHERE id=?", (match["code"] if match else None, row["id"]))
    db.commit()
