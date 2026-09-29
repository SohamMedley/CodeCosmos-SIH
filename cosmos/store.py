"""SQLite storage and included, explicitly illustrative demonstration data."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from .engine import extract_attributes, normalize

SAMPLE_RECORDS = [
    ("ONGC", "ONGC-1042", "Bearing 6205"),
    ("BHEL", "BHEL-2201", "6205 Deep Groove Ball Bearing"),
    ("NTPC", "NTPC-0091", "BALL BEARING, 6205"),
    ("SAIL", "SAIL-8205", "SKF 6205 BEARING"),
    ("ONGC", "ONGC-1043", "Bearing 6206"),
    ("NTPC", "NTPC-0092", "Deep groove ball bearing 6206"),
    ("BHEL", "BHEL-0101", "SS Bolt M10 x 50 mm Grade 8.8"),
    ("SAIL", "SAIL-1412", "Stainless Steel Hex Bolt M10 × 5 cm Gr 8.8"),
    ("ONGC", "ONGC-0113", "M10 x 50mm stainless steel hexagonal bolt grade 8.8"),
    ("NTPC", "NTPC-1211", "SS Hex Bolt M10 x 60 mm Grade 8.8"),
    ("BHEL", "BHEL-3023", "MS Pipe DN50 PN16"),
    ("SAIL", "SAIL-3314", "Mild Steel Pipe DN 50 Pressure PN16"),
    ("ONGC", "ONGC-0031", "Mild Steel Pipe DN50 PN25"),
    ("NTPC", "NTPC-4001", "Copper Cable 2.5 sq mm 3 core"),
    ("BHEL", "BHEL-4002", "3 Core Copper Cable 2.5 mm2"),
    ("SAIL", "SAIL-4600", "3 Core Copper Cable 4 sqmm"),
]
# DEMO identifiers are deliberately NOT represented as official CNMC codes.
SAMPLE_REFERENCES = [
    ("DEMO-BRG-6205", "Deep Groove Ball Bearing 6205"),
    ("DEMO-BRG-6206", "Deep Groove Ball Bearing 6206"),
    ("DEMO-BLT-1050", "Stainless Steel Hex Bolt M10 x 50 mm Grade 8.8"),
    ("DEMO-BLT-1060", "Stainless Steel Hex Bolt M10 x 60 mm Grade 8.8"),
    ("DEMO-PIP-5016", "Mild Steel Pipe DN50 PN16"),
    ("DEMO-PIP-5025", "Mild Steel Pipe DN50 PN25"),
    ("DEMO-CAB-253", "Copper Cable 2.5 mm2 3 Core"),
    ("DEMO-CAB-403", "Copper Cable 4 mm2 3 Core"),
]

SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    external_id TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL,
    normalized TEXT NOT NULL,
    attributes_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reference_catalog (
    code TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    normalized TEXT NOT NULL,
    attributes_json TEXT NOT NULL,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    left_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    right_id INTEGER NOT NULL REFERENCES records(id) ON DELETE CASCADE,
    score REAL NOT NULL,
    tier TEXT NOT NULL,
    signals_json TEXT NOT NULL,
    matched_json TEXT NOT NULL,
    warnings_json TEXT NOT NULL,
    ai_reason TEXT,
    engine TEXT NOT NULL,
    suggested_code TEXT,
    mapping_code TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewer_note TEXT NOT NULL DEFAULT '',
    reviewed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(left_id, right_id)
);
CREATE TABLE IF NOT EXISTS review_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    candidate_id INTEGER NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    mapping_code TEXT,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS analysis_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    considered INTEGER NOT NULL,
    candidates INTEGER NOT NULL,
    ai_enriched INTEGER NOT NULL,
    mode TEXT NOT NULL,
    warning TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_candidates_status ON candidates(status, score DESC);
CREATE INDEX IF NOT EXISTS idx_records_source ON records(source);
"""


def connection(path: str | Path) -> sqlite3.Connection:
    db = sqlite3.connect(str(path), timeout=30)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA busy_timeout=30000")
    return db


def insert_record(db: sqlite3.Connection, source: str, external_id: str, description: str) -> None:
    db.execute(
        "INSERT INTO records (source, external_id, description, normalized, attributes_json) VALUES (?, ?, ?, ?, ?)",
        (source, external_id, description, normalize(description), json.dumps(extract_attributes(description))),
    )


def insert_reference(db: sqlite3.Connection, code: str, description: str, is_demo: bool = False) -> None:
    db.execute(
        "INSERT INTO reference_catalog (code, description, normalized, attributes_json, is_demo) VALUES (?, ?, ?, ?, ?)",
        (code, description, normalize(description), json.dumps(extract_attributes(description)), int(is_demo)),
    )


def seed_demo(db: sqlite3.Connection) -> None:
    from .service import analyze

    for source, external_id, description in SAMPLE_RECORDS:
        insert_record(db, source, external_id, description)
    for code, description in SAMPLE_REFERENCES:
        insert_reference(db, code, description, is_demo=True)
    analyze(db, api_key="", mode="demo")
    db.commit()


def init_database(path: str | Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    db = connection(path)
    try:
        db.executescript(SCHEMA)
        # A fresh installation starts with a visible, fully interactive sample workspace.
        if db.execute("SELECT COUNT(*) FROM records").fetchone()[0] == 0:
            seed_demo(db)
        db.commit()
    finally:
        db.close()


def record_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "source": row["source"],
        "external_id": row["external_id"],
        "description": row["description"],
        "normalized": row["normalized"],
        "attributes": json.loads(row["attributes_json"]),
        "created_at": row["created_at"],
    }


def reference_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "code": row["code"],
        "description": row["description"],
        "normalized": row["normalized"],
        "attributes": json.loads(row["attributes_json"]),
        "is_demo": bool(row["is_demo"]),
    }


def candidate_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "left": {
            "id": row["left_id"], "source": row["left_source"],
            "external_id": row["left_external_id"], "description": row["left_description"],
            "normalized": row["left_normalized"], "attributes": json.loads(row["left_attributes"]),
        },
        "right": {
            "id": row["right_id"], "source": row["right_source"],
            "external_id": row["right_external_id"], "description": row["right_description"],
            "normalized": row["right_normalized"], "attributes": json.loads(row["right_attributes"]),
        },
        "score": row["score"], "tier": row["tier"],
        "signals": json.loads(row["signals_json"]),
        "matched": json.loads(row["matched_json"]),
        "warnings": json.loads(row["warnings_json"]),
        "ai_reason": row["ai_reason"], "engine": row["engine"],
        "suggested_code": row["suggested_code"],
        "mapping_code": row["mapping_code"], "status": row["status"],
        "reviewer_note": row["reviewer_note"], "reviewed_at": row["reviewed_at"],
    }

CANDIDATE_QUERY = """
SELECT c.*, a.source AS left_source, a.external_id AS left_external_id,
       a.description AS left_description, a.normalized AS left_normalized,
       a.attributes_json AS left_attributes,
       b.source AS right_source, b.external_id AS right_external_id,
       b.description AS right_description, b.normalized AS right_normalized,
       b.attributes_json AS right_attributes
FROM candidates c JOIN records a ON a.id = c.left_id JOIN records b ON b.id = c.right_id
"""


def get_candidates(db: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = db.execute(CANDIDATE_QUERY + " ORDER BY CASE c.status WHEN 'pending' THEN 0 ELSE 1 END, c.score DESC, c.id LIMIT 180").fetchall()
    return [candidate_dict(row) for row in rows]


def get_stats(db: sqlite3.Connection) -> dict[str, Any]:
    count = lambda table: db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]  # known constant table names only
    statuses = {row["status"]: row["total"] for row in db.execute("SELECT status, COUNT(*) total FROM candidates GROUP BY status")}
    sources = [{"name": row["source"], "count": row["total"]} for row in db.execute(
        "SELECT source, COUNT(*) total FROM records GROUP BY source ORDER BY total DESC, source"
    )]
    latest = db.execute("SELECT * FROM analysis_runs ORDER BY id DESC LIMIT 1").fetchone()
    return {
        "records": count("records"),
        "candidates": count("candidates"),
        "pending": statuses.get("pending", 0),
        "approved": statuses.get("approved", 0),
        "rejected": statuses.get("rejected", 0),
        "mapped": db.execute("SELECT COUNT(*) FROM candidates WHERE status='approved' AND mapping_code IS NOT NULL").fetchone()[0],
        "references": count("reference_catalog"),
        "demo_references": db.execute("SELECT COUNT(*) FROM reference_catalog WHERE is_demo=1").fetchone()[0],
        "sources": sources,
        "last_run": dict(latest) if latest else None,
    }
