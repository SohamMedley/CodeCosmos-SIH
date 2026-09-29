"""Code Cosmos — SIH26099 prototype. Flask serves the UI and same-origin JSON API."""

from __future__ import annotations

import csv
from io import StringIO
import os
from pathlib import Path
import re
import sqlite3
from typing import Any

from dotenv import load_dotenv
from flask import Flask, Response, g, jsonify, render_template, request
from werkzeug.exceptions import HTTPException

from cosmos.engine import best_reference, compare
from cosmos.groq import DEFAULT_MODEL, GroqUnavailable, assess_pairs
from cosmos.service import analyze, refresh_recommendations
from cosmos.store import (
    CANDIDATE_QUERY, SAMPLE_RECORDS, connection, get_candidates, get_stats,
    init_database, insert_record, insert_reference, record_dict, reference_dict, seed_demo,
)

load_dotenv()
ROOT = Path(__file__).resolve().parent
MAX_RECORDS = 1000
MAX_REFERENCES = 500


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _field(value: Any, label: str, maximum: int, minimum: int = 1) -> str:
    if not isinstance(value, str):
        raise ApiError(f"{label} must be text")
    text = " ".join(value.strip().split())
    if not minimum <= len(text) <= maximum:
        raise ApiError(f"{label} must contain {minimum}–{maximum} characters")
    return text


def _csv_rows(file: Any, required: set[str], maximum: int) -> list[dict[str, str]]:
    if not file or not file.filename or not file.filename.lower().endswith(".csv"):
        raise ApiError("Choose a .csv file")
    raw = file.read(2_000_001)
    if len(raw) > 2_000_000:
        raise ApiError("CSV files must be smaller than 2 MB")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ApiError("Save the CSV as UTF-8 and try again") from exc
    try:
        reader = csv.DictReader(StringIO(text), strict=True)
        if not reader.fieldnames:
            raise ApiError("The CSV is empty")
        names = [str(name).strip().lower() for name in reader.fieldnames]
        if len(set(names)) != len(names) or not required.issubset(names):
            raise ApiError(f"CSV needs a {', '.join(sorted(required))} column and no duplicate headers")
        reader.fieldnames = names
        rows: list[dict[str, str]] = []
        for row in reader:
            if None in row:
                raise ApiError(f"Row {reader.line_num} has more fields than the header")
            if not any(str(value or "").strip() for value in row.values()):
                continue
            rows.append({key: str(value or "").strip() for key, value in row.items()})
            if len(rows) > maximum:
                raise ApiError(f"This prototype accepts up to {maximum} rows per import")
    except csv.Error as exc:
        raise ApiError(f"Invalid CSV: {exc}") from exc
    if not rows:
        raise ApiError("The CSV has no data rows")
    return rows


def _json_object() -> dict[str, Any]:
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        raise ApiError("Send a JSON object")
    return payload


def _csv_safe(value: Any) -> str:
    text = "" if value is None else str(value)
    return "'" + text if text.lstrip().startswith(("=", "+", "-", "@")) else text


def _export(filename: str, headers: list[str], rows: list[list[Any]]) -> Response:
    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    writer.writerows([[_csv_safe(value) for value in row] for row in rows])
    return Response(output.getvalue(), mimetype="text/csv", headers={
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "no-store",
    })


def create_app(test_config: dict[str, Any] | None = None) -> Flask:
    app = Flask(__name__)
    app.config.update(
        DATABASE=os.getenv("DB_PATH", str(ROOT / "data" / "codecosmos.sqlite3")),
        GROQ_API_KEY=os.getenv("GROQ_API_KEY", ""),
        GROQ_MODEL=os.getenv("GROQ_MODEL", DEFAULT_MODEL),
        MAX_CONTENT_LENGTH=3 * 1024 * 1024,
        JSON_SORT_KEYS=False,
    )
    if test_config:
        app.config.update(test_config)
    init_database(app.config["DATABASE"])

    def db() -> sqlite3.Connection:
        if "database" not in g:
            g.database = connection(app.config["DATABASE"])
        return g.database

    @app.teardown_appcontext
    def close_db(exc: BaseException | None) -> None:
        database = g.pop("database", None)
        if database is not None:
            database.close()

    @app.errorhandler(ApiError)
    def handle_api_error(exc: ApiError):
        return jsonify({"error": str(exc)}), exc.status

    @app.errorhandler(HTTPException)
    def handle_http_error(exc: HTTPException):
        if request.path.startswith("/api/"):
            return jsonify({"error": exc.description}), exc.code
        return exc

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/health")
    def health():
        return jsonify({"status": "ok", "service": "code-cosmos"})

    @app.get("/api/state")
    def state():
        store = db()
        records = [record_dict(row) for row in store.execute("SELECT * FROM records ORDER BY id DESC LIMIT 1000")]
        references = [reference_dict(row) for row in store.execute("SELECT * FROM reference_catalog ORDER BY code LIMIT 500")]
        activity = [dict(row) for row in store.execute(
            """SELECT e.action, e.mapping_code, e.note, e.created_at,
                      a.description AS left_description, b.description AS right_description
               FROM review_events e JOIN candidates c ON c.id=e.candidate_id
               JOIN records a ON a.id=c.left_id JOIN records b ON b.id=c.right_id
               ORDER BY e.id DESC LIMIT 6"""
        )]
        return jsonify({
            "records": records, "references": references, "candidates": get_candidates(store),
            "stats": get_stats(store), "activity": activity,
            "integration": {"configured": bool(app.config["GROQ_API_KEY"]), "model": app.config["GROQ_MODEL"]},
        })

    @app.get("/api/templates/materials.csv")
    def materials_template():
        return _export("codecosmos-materials-template.csv", ["source", "external_id", "description"],
                       [list(row) for row in SAMPLE_RECORDS[:5]])

    @app.get("/api/templates/references.csv")
    def references_template():
        return _export("codecosmos-reference-template.csv", ["code", "description"], [
            ["YOUR-CODE-001", "Deep Groove Ball Bearing 6205"],
            ["YOUR-CODE-002", "Stainless Steel Hex Bolt M10 x 50 mm Grade 8.8"],
        ])

    @app.post("/api/import/records")
    def import_records():
        mode = request.form.get("mode", "replace")
        if mode not in {"replace", "append"}:
            raise ApiError("Import mode must be append or replace")
        rows = _csv_rows(request.files.get("file"), {"description"}, MAX_RECORDS)
        parsed = []
        for number, row in enumerate(rows, start=2):
            desc = _field(row.get("description", ""), f"Description on row {number}", 400, 3)
            source = _field(row.get("source") or row.get("cpse") or "Imported", f"Source on row {number}", 60)
            external_id = _field(row.get("external_id") or row.get("material_code") or "", "External ID", 80, 0)
            parsed.append((source, external_id, desc))
        store = db()
        if mode == "append":
            current_count = store.execute("SELECT COUNT(*) FROM records").fetchone()[0]
            if current_count + len(parsed) > MAX_RECORDS:
                raise ApiError(f"Append would exceed this prototype's {MAX_RECORDS}-record workspace limit")
            existing_ids = {(row["source"].lower(), row["external_id"].lower()) for row in store.execute(
                "SELECT source, external_id FROM records WHERE external_id != ''"
            )}
            for source, external_id, _ in parsed:
                if external_id:
                    key = (source.lower(), external_id.lower())
                    if key in existing_ids:
                        raise ApiError(f"Record {source} / {external_id} is already in the workspace")
                    existing_ids.add(key)
        try:
            if mode == "replace":
                store.execute("DELETE FROM review_events")
                store.execute("DELETE FROM candidates")
                store.execute("DELETE FROM records")
                store.execute("DELETE FROM analysis_runs")
                store.execute("DELETE FROM sqlite_sequence WHERE name IN ('records', 'candidates', 'review_events', 'analysis_runs')")
            for source, external_id, desc in parsed:
                insert_record(store, source, external_id, desc)
            result = analyze(store, mode="local")
        except Exception:
            store.rollback()
            raise
        action = "Added" if mode == "append" else "Imported"
        return jsonify({"message": f"{action} {len(parsed)} records and generated local candidates", "run": result})

    @app.post("/api/import/references")
    def import_references():
        if request.form.get("confirm") != "REPLACE_REFERENCES":
            raise ApiError("Confirm replacement of the reference catalog")
        rows = _csv_rows(request.files.get("file"), {"code", "description"}, MAX_REFERENCES)
        parsed = []
        seen = set()
        for number, row in enumerate(rows, start=2):
            code = _field(row.get("code", ""), f"Code on row {number}", 64)
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,63}", code):
                raise ApiError(f"Code on row {number} contains unsupported characters")
            if code.lower() in seen:
                raise ApiError(f"Duplicate code {code} on row {number}")
            seen.add(code.lower())
            desc = _field(row.get("description", ""), f"Description on row {number}", 400, 3)
            parsed.append((code, desc))
        store = db()
        try:
            store.execute("DELETE FROM reference_catalog")
            for code, desc in parsed:
                insert_reference(store, code, desc)
            # Match decisions stay validated; old code assignments must not masquerade as current ones.
            for row in store.execute("SELECT id, mapping_code FROM candidates WHERE mapping_code IS NOT NULL").fetchall():
                store.execute("INSERT INTO review_events (candidate_id, action, note) VALUES (?, 'mapping_cleared', ?)",
                              (row["id"], "Reference catalog replaced; previous code assignment removed"))
            store.execute("UPDATE candidates SET mapping_code=NULL")
            refresh_recommendations(store)
        except Exception:
            store.rollback()
            raise
        return jsonify({"message": f"Loaded {len(parsed)} reference codes; existing match decisions were kept"})

    @app.post("/api/analysis/run")
    def run_analysis():
        payload = _json_object()
        use_ai = payload.get("use_ai", False) is True
        key = app.config["GROQ_API_KEY"] if use_ai else ""
        result = analyze(db(), api_key=key, model=app.config["GROQ_MODEL"])
        if use_ai and not key:
            result["warning"] = "Groq key not configured; local matching was used"
        return jsonify({"message": "Analysis complete", "run": result})

    @app.post("/api/compare")
    def compare_descriptions():
        payload = _json_object()
        left = _field(payload.get("left"), "First description", 400, 3)
        right = _field(payload.get("right"), "Second description", 400, 3)
        ai = None
        warning = None
        if payload.get("use_ai") is True:
            key = app.config["GROQ_API_KEY"]
            if key:
                try:
                    ai = assess_pairs([{"id": "comparison", "left": left, "right": right}], key, app.config["GROQ_MODEL"]).get("comparison")
                except GroqUnavailable as exc:
                    warning = str(exc)
            else:
                warning = "Groq key not configured; local matching was used"
        result = compare(left, right, ai)
        refs = [dict(row) for row in db().execute("SELECT code, description, is_demo FROM reference_catalog")]
        result["reference"] = best_reference(left, right, refs) if result["eligible"] else None
        result["warning"] = warning
        return jsonify(result)

    @app.post("/api/candidates/<int:candidate_id>/review")
    def review_candidate(candidate_id: int):
        payload = _json_object()
        decision = payload.get("decision")
        if decision not in {"approved", "rejected"}:
            raise ApiError("Decision must be approved or rejected")
        note = _field(payload.get("note", ""), "Review note", 500, 0)
        mapping_code = payload.get("mapping_code") or None
        if mapping_code is not None and not isinstance(mapping_code, str):
            raise ApiError("Invalid reference code")
        store = db()
        candidate = store.execute(CANDIDATE_QUERY + " WHERE c.id=?", (candidate_id,)).fetchone()
        if not candidate:
            raise ApiError("Candidate not found", 404)
        if decision == "rejected":
            mapping_code = None
        elif mapping_code:
            reference = store.execute("SELECT * FROM reference_catalog WHERE code=?", (mapping_code,)).fetchone()
            if not reference:
                raise ApiError("Select a code from the current reference catalog")
            for description in (candidate["left_description"], candidate["right_description"]):
                match = compare(description, reference["description"])
                if match["conflicts"]:
                    raise ApiError("Reference code conflicts with a technical specification: " + match["conflicts"][0])
                if match["score"] < 0.61 and not note:
                    raise ApiError("Add a review note to justify this uncertain code assignment")
        store.execute(
            "UPDATE candidates SET status=?, mapping_code=?, reviewer_note=?, reviewed_at=datetime('now') WHERE id=?",
            (decision, mapping_code, note, candidate_id),
        )
        store.execute(
            "INSERT INTO review_events (candidate_id, action, mapping_code, note) VALUES (?, ?, ?, ?)",
            (candidate_id, decision, mapping_code, note),
        )
        store.commit()
        return jsonify({"message": "Match approved" if decision == "approved" else "Match rejected"})

    @app.get("/api/export/master.csv")
    def export_master():
        store = db()
        rows = store.execute(CANDIDATE_QUERY + " WHERE c.status='approved' ORDER BY c.reviewed_at DESC, c.id DESC").fetchall()
        demo_codes = {row["code"] for row in store.execute("SELECT code FROM reference_catalog WHERE is_demo=1")}
        return _export("codecosmos-validated-master.csv", [
            "reference_code", "reference_type", "record_a_source", "record_a_id", "record_a_description",
            "record_b_source", "record_b_id", "record_b_description", "match_score",
            "reviewer_note", "validated_at",
        ], [
            [row["mapping_code"],
             "illustrative demo" if row["mapping_code"] in demo_codes else "imported" if row["mapping_code"] else "unmapped",
             row["left_source"], row["left_external_id"], row["left_description"],
             row["right_source"], row["right_external_id"], row["right_description"],
             f"{row['score']:.4f}", row["reviewer_note"], row["reviewed_at"]]
            for row in rows
        ])

    @app.get("/api/export/audit.csv")
    def export_audit():
        rows = db().execute("SELECT * FROM review_events ORDER BY id DESC").fetchall()
        return _export("codecosmos-review-audit.csv", ["event_id", "candidate_id", "action", "reference_code", "note", "timestamp"],
                       [[r["id"], r["candidate_id"], r["action"], r["mapping_code"], r["note"], r["created_at"]] for r in rows])

    @app.post("/api/demo/reset")
    def reset_demo():
        payload = _json_object()
        if payload.get("confirm") != "RESET_DEMO":
            raise ApiError("Confirm resetting the workspace to demo data")
        store = db()
        store.execute("DELETE FROM review_events")
        store.execute("DELETE FROM candidates")
        store.execute("DELETE FROM records")
        store.execute("DELETE FROM reference_catalog")
        store.execute("DELETE FROM analysis_runs")
        store.execute("DELETE FROM sqlite_sequence WHERE name IN ('records', 'candidates', 'review_events', 'analysis_runs')")
        seed_demo(store)
        return jsonify({"message": "Demo workspace restored"})

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=os.getenv("FLASK_DEBUG") == "1")
