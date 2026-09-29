# Code Cosmos · Material Intelligence

A working, human-in-the-loop prototype for **Smart India Hackathon 2026 · SIH26099** — AI-driven standardization and harmonization of material codes across CPSEs. Built with **HTML, CSS, vanilla JavaScript and Python**. Flask serves the UI and JSON API from one origin; the optional Groq chat API provides a semantic second opinion.

## What you can do

- Explore a preloaded, interactive 16-record demo spanning four illustrative CPSE sources.
- Import a UTF-8 material CSV; normalize descriptions and extract explicit technical specifications (bearing designations/seals/clearances, bolt threads/lengths/grades, pipe DN/PN/schedules, cable cross-sections/cores, materials, and units).
- Generate explainable candidate matches using synonym-aware **local sparse vectors**, fuzzy text similarity, and technical-attribute checks. **Known specification conflicts block recommendations**, including when Groq says otherwise.
- Optionally enrich up to eight shortlisted pairs per run with **Groq** semantic reasoning. Compare any two descriptions live in the Intelligence Lab.
- Inspect evidence and warnings, approve or reject links manually, write review notes, and preserve a review audit trail.
- Recommend reference codes from an importable library; export a validated material master and review log as CSV.

**Important:** `DEMO-*` codes are deliberately illustrative placeholders, **not official CNMC identifiers**. Import an authorized `code,description` reference CSV for real code recommendations. A match score is a heuristic ranking, **not** a calibrated probability or a guarantee of engineering interchangeability. No recommendation is automatically approved.

## Run locally

Requires Python 3.10+.

```bash
python -m venv .venv
source .venv/bin/activate              # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                    # optional: add your GROQ_API_KEY here
python app.py
```

Open `http://localhost:5000`. The local matching and all review flows work without a Groq key. Get a key at [Groq Console](https://console.groq.com/keys) to enable model-assisted reasoning. **Never commit or put the key into frontend code.**

Run tests:

```bash
python -m unittest discover -s tests -v
```

## Deploy with a Render Blueprint

1. Push this repository to GitHub.
2. In Render, choose **New → Blueprint**, connect the repository, and apply `render.yaml`.
3. When Render prompts for `GROQ_API_KEY`, enter your key as a private environment variable. `GROQ_MODEL` defaults to `llama-3.3-70b-versatile` and can be changed if your Groq account uses another compatible chat model. A missing key does not stop deployment: local matching remains available.
4. Render installs `requirements.txt`, starts Gunicorn bound to `0.0.0.0:$PORT`, and monitors `/health`. The UI and API use the **same origin**, so no browser-facing localhost calls or CORS settings are needed.

### Persistence on Render

The default SQLite database is `data/codecosmos.sqlite3`, created and seeded on first start. **Render's free web-service filesystem is ephemeral**: records and review decisions may disappear on redeploy or instance replacement. Export your master/audit CSV before resetting. For persistence, use an eligible Render plan with a mounted disk and set `DB_PATH` to its absolute mount path (for example `/var/data/codecosmos.sqlite3`), or replace SQLite with a managed database. Do not use this unauthenticated prototype for sensitive or production CPSE data; add access controls, a persistent database, and organizational security/privacy approval first. When Groq is enabled for a run, selected descriptions are sent to Groq; use local mode if that is not authorized.

## CSV formats

Material import: up to **1,000 rows**, UTF-8, **2 MB**. `description` is required; `source` (or `cpse`) and `external_id` (or `material_code`) are optional. **Replace** (the initial default) removes workspace records and review decisions but keeps the reference library; use it when moving off the demo dataset. **Add** keeps existing records, approved links, mappings and their audit history, building reusable material knowledge across batches. The total workspace is capped at 1,000 records; source + external ID must be unique when adding. A local analysis runs immediately after import; the optional Groq pass is a separate, explicit action.

```csv
source,external_id,description
ONGC,ONGC-1042,Bearing 6205
BHEL,BHEL-2201,6205 Deep Groove Ball Bearing
```

Reference import: up to **500 rows**, UTF-8, **2 MB**. `code` and `description` are required. Importing a replacement catalog retains approved/rejected match decisions but clears old code assignments and recalculates recommendations. Only use codes that you are authorized to map.

```csv
code,description
YOUR-CODE-001,Deep Groove Ball Bearing 6205
```

Example files are in [`examples/`](examples). Both CSV templates can also be downloaded in the app. Exports guard against spreadsheet formula injection.

## Matching and review policy

1. Normalize common terms, formatting and length units (e.g. `5 cm` → `50 mm`).
2. Extract **stated** technical facts. Absent specifications stay unknown; the system does not invent them.
3. Apply technical blocking before scoring: a known mismatch in family, bearing designation/seal/clearance, size, grade, material, DN/PN/schedule, cross-section, or core count prevents a candidate.
4. Rank remaining pairs using local synonym-aware sparse vectors, fuzzy text, and technical fit; optionally blend Groq's structured semantic opinion for a small shortlist. Groq **cannot override a blocker**. A missing spec or uncertain manufacturer caps the score and requires review.
5. An expert confirms/rejects a candidate and may choose a matching reference code. The chosen code is checked against **both** descriptions for technical conflicts. Approval without a code is allowed and remains marked *unmapped*.
6. Export the human-validated relationships and an audit CSV.

This prototype does **not** ship a pretrained embedding model: Groq exposes chat reasoning here, while the lightweight local vector is synonym-aware, not a neural sentence embedding. For a production-scale system, add an approved embedding provider/model, calibrated confidence on labeled data, stronger domain-specific parsers, blocking/indexing at scale, role-based access, and a governed CNMC catalog. To bound response times this interactive prototype evaluates at most **24 compatible pairs per record** and stores the top **180 candidate pairs**; it warns if a dataset hits these limits. It should not be described as exhaustive deduplication at scale.

## API (same origin)

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | Render health check |
| `GET /api/state` | Workspace, candidate evidence, stats, integration status (never the key) |
| `POST /api/import/records` | Multipart CSV (`file`, `mode=replace` or `mode=append`) |
| `POST /api/analysis/run` | JSON `{"use_ai": true}`; local fallback when Groq unavailable |
| `POST /api/compare` | JSON `{"left":"…", "right":"…", "use_ai":false}` |
| `POST /api/candidates/<id>/review` | JSON decision `approved`/`rejected`, optional `mapping_code` and `note` |
| `POST /api/import/references` | Multipart CSV + `confirm=REPLACE_REFERENCES` |
| `GET /api/export/master.csv` | Validated links and code assignments |
| `GET /api/export/audit.csv` | Reviewer event log |
| `POST /api/demo/reset` | JSON `{"confirm":"RESET_DEMO"}` — destructive |

### Project layout

- `app.py` — Flask API, CSV validation, server-side configuration
- `cosmos/engine.py` — normalization, attribute extraction, safety checks, explainable ranking
- `cosmos/groq.py` — optional Groq chat completions client and response validation
- `cosmos/service.py`, `cosmos/store.py` — bounded candidate generation, SQLite, sample data
- `templates/index.html`, `static/css/styles.css`, `static/js/app.js` — responsive interface
- `static/fonts/` — self-hosted OFL-licensed UI fonts and their license notices (no external font request)
- `render.yaml` — Render Blueprint
- `tests/` — backend and workflow tests

**Team Code Cosmos · Smart Automation · Software · SIH26099**
