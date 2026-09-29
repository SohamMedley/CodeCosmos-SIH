# Code Cosmos · AI-Driven Standardization &amp; Harmonization of Material Codes Across CPSEs

**Smart India Hackathon 2026 · Problem Statement `SIH26099` · Theme: Smart Automation · Category: Software · Team Code Cosmos**

A working, fully client-side prototype that reads inconsistent CPSE material descriptions, understands their
engineering meaning, standardizes their units, scores its own confidence, sends only the uncertain cases to a human
expert and finally emits a validated material master with CNMC mapping.

> **No backend. No Python. No build step. No API keys.**
> Pure HTML + CSS + vanilla JavaScript ES modules. Open `index.html` and the entire engine runs in the browser.

---

## 1. The problem in one example

Four CPSEs store the *same* bearing four different ways:

```
BHEL   Bearing 6205
SAIL   6205 Deep Groove Ball Bearing
NTPC   BALL BEARING, 6205
ONGC   SKF 6205 BEARING
```

Exact text comparison sees four different materials. This engine sees one engineering item — **and** proves why:

| Signal | Value |
| --- | --- |
| Semantic similarity (concept embeddings) | 96.4 % |
| Fuzzy text similarity (token-set / Jaro-Winkler / n-gram) | 71.2 % |
| Technical attribute agreement | 100 % (designation `6205` identical) |
| **Confidence** | **95.5 % → Auto-accept band** |

Change one digit and the system *refuses* to merge — because `6205` and `6206` are different bearings:

```
BHEL   Bearing 6205
SKF    6206 BEARING
→ confidence 8.1 % · decisive conflict on designation · kept as two distinct materials
```

---

## 2. The full pipeline (all ten stages run live in the browser)

```
CPSE material records (raw, legacy, inconsistent)
        │
 1  Data cleaning & text normalization        case, unicode, shorthand, vendor & part-number neutralisation
 2  Technical attribute extraction             designation, material, grade, thread, bore/OD, pressure class, rating
 3  Unit standardization                      12 physical quantities → SI base units (50 mm = 5 cm = 1.97 in)
 4  Semantic embedding generation             concept-expanded tf-idf vectors + 2-D PCA projection
 5  Hybrid matching                           semantic ⊕ fuzzy ⊕ technical-attribute scoring
 6  Duplicate / near-duplicate detection      transitive clustering into one engineering item
 7  Confidence scoring & decision bands       calibrated score with decisive-conflict caps + explanation trail
 8  Human validation queue                    only the uncertain band reaches an expert (keyboard-first review)
 9  CNMC harmonization                        one standard description, one CNMC code, one UOM per item
10  Reusable knowledge base                   validated mappings are retained and fed back into later runs
```

---

## 3. What actually runs (not a mock-up)

| Capability | Implementation |
| --- | --- |
| Normalization | `assets/js/core/normalize.js` — unicode repair, 60+ CPSE abbreviations, vendor/part-number stripping, filler-clause removal, token-level diff trail |
| Attribute extraction | `assets/js/core/attributes.js` — 25 extractor families across designation, material, finish, standard, grade, bore/OD/width, thread, DN size, angle, pressure class, rating, IP, insulation, hardness, ends, ratio |
| Unit standardization | `assets/js/core/units.js` — length, mass, pressure, power, voltage, current, frequency, temperature, flow, torque, speed, area, volume tables with fraction & inch parsing |
| Fuzzy matching | `assets/js/core/fuzzy.js` — banded Levenshtein, Jaro-Winkler, token-set/token-sort ratio, character 3-gram Jaccard, bounded partial ratio |
| Semantic matching | `assets/js/core/embed.js` — material-concept ontology → tf-idf weighting → seeded random projection (64-d) → cosine; power-iteration PCA for the visualisation |
| Fusion & confidence | `assets/js/core/matcher.js` — weighted fusion, density penalty, decisive-conflict hard caps, evidence asymmetry caps, full explanation records |
| Clustering & metrics | `assets/js/core/pipeline.js` — union-find clusters, precision/recall/F1 sweep, cluster purity, reviewer-effort model, audit log |
| CNMC mapping | `assets/js/core/cnmc.js` — deterministic class/type/material/size/variant code generation with completeness flags |
| Corpus | `assets/js/data/catalog.js` — 56 engineering concepts × 16 CPSEs with realistic noise (case, unit mix, word order, typos, vendor prefixes) and **hidden ground truth** used only for scoring |

Everything above is measured at runtime, so the Benchmark tab reports real numbers rather than estimates.

---

## 4. Using the prototype

| Tab | What to do |
| --- | --- |
| **Overview** | Press **Run live harmonization** and watch the ten stages animate. |
| **Pipeline** | Stage-by-stage throughput, audit log and the four-way normalization showcase. |
| **Data Explorer** | Semantic embedding space (each dot is a record), corpus composition, searchable record table, click any row for its attribute packet. |
| **Match Workbench** | Pick two records (or load the SIH example set) and see the confidence gauge, the three signal bars, attribute-by-attribute agreement and the reasoning trail. A live console at the bottom analyses **any** description you type. |
| **Expert Review** | The human-in-the-loop queue. Press **A** to approve, **R** to reject — clusters, master and metrics update instantly. |
| **Benchmark** | Precision/Recall/F1 vs threshold with a draggable operating point, confidence histogram, integrity checks and the near-miss gallery (pairs the engine deliberately refused to merge). |
| **Material Master** | The harmonized output: CNMC code, standard description, UOM, merged source records, cohesion. Export CSV/JSON. |
| **Control Console** | Corpus size & seed, signal weights, decision thresholds, unit equivalence table and the live rule inspector. |
| **Team & Approach** | Architecture, research foundation, benefits, roadmap and the prototype disclosure. |

Keyboard: `Ctrl/⌘ + R` re-runs the pipeline · `A` / `R` decide a review case · `Esc` closes panels.

---

## 5. Deploying on Render

This repository contains a [`render.yaml`](render.yaml) Blueprint that deploys the project as a **Render Static Site**
(no server runtime required).

1. Push the repository to GitHub.
2. Render Dashboard → **New +** → **Blueprint** → select the repository.
3. Render reads `render.yaml`, creates the static site and deploys it.
4. Every commit to the connected branch redeploys automatically; pull requests get preview URLs.

Manual alternative (without the Blueprint):

```
New + → Static Site → connect repo
Build Command:    (leave empty)
Publish Directory: .
```

`render.yaml` also sets security headers, immutable-ish caching for `assets/`, and SPA-style rewrites for the
`/pipeline`, `/records`, `/benchmark` and `/master` pretty paths.

Any static host works too — Netlify, GitHub Pages, Cloudflare Pages, S3, or a local `python3 -m http.server`.
The site needs no environment variables and makes no network calls.

---

## 6. Repository layout

```
.
├── index.html                 # application shell (all nine views)
├── render.yaml                # Render Blueprint (static site, headers, rewrites)
├── assets/
│   ├── css/
│   │   ├── base.css           # design tokens, cinematic background, animations
│   │   └── app.css            # components, tables, charts, full responsiveness
│   └── js/
│       ├── main.js            # hash router, theme, global chrome
│       ├── core/              # units, normalize, attributes, fuzzy, embed, matcher, cnmc, pipeline, state
│       ├── data/catalog.js    # synthetic CPSE corpus + noise engine + ground truth
│       ├── viz/charts.js      # canvas line / bar / histogram / scatter / grouped-bar charts
│       ├── components/        # ui primitives + shared render helpers
│       └── views/             # one module per tab
└── scripts/smoke.mjs          # optional headless test of every view (needs jsdom)
```

---

## 7. Measured results (default run: 260 legacy rows, seed 20260129)

| Metric | Value |
| --- | --- |
| Legacy rows processed | 260 (16 CPSEs, 56 engineering concepts) |
| Candidate pairs scored | 1,647 out of 33,670 possible — **95.1 % fewer comparisons** |
| Auto-accept band | 647 pairs decided without a human |
| Precision / Recall / F1 | **100 % / 87.3 % / 93.2 %** vs hidden ground truth |
| Cluster purity | **100 %** — no two different engineering items were merged |
| Duplicate rows collapsed | 200 legacy rows → 60 canonical items |
| Reviewer effort removed | **92.9 %** (manual ≈ 196 h → assisted ≈ 14 h of review) |
| Master items produced | 60, each with a CNMC mapping and one UOM |
| Engine runtime | ≈ 9 s for the full ten-stage run, entirely in-browser |

Numbers are recomputed on every run and visible in the **Benchmark** tab; they change with corpus size, seed,
signal weights and thresholds.

---

## 8. Interface & design system

* **Light theme by default.** The palette is light-first (`assets/css/base.css` holds both token sets); dark is applied
  only when the visitor's system asks for it, and the topbar toggle switches instantly and redraws every canvas chart.
* **No loading screen.** The shell renders straight into a usable state — there is no splash, spinner or artificial
  delay anywhere in the boot path.
* **Graded motion.** Entrance, hover, focus and state-change animation is defined once as a keyframe/timing library
  (`--e-out`, `--e-soft`, `--e-spring`, `--e-inout`) with a stagger helper for lists and card grids. Charts animate
  their own draw-in and always land on the final frame even if animation frames are throttled.
* **Reduced motion respected.** `prefers-reduced-motion: reduce` collapses every transition and keyframe to its end
  state.
* **Icons are inline SVG.** No icon font, no external request, no unicode-glyph fallback that can render as tofu on a
  machine with a different font stack.
* **Responsive from 320 px to 1920 px.** All nine views were swept at twelve widths — 320, 360, 414, 480, 600, 768,
  900, 1024, 1280, 1440, 1600 and 1920 px — with zero horizontal overflow at any of them.
* **Accessible by construction.** Skip link, visible focus rings, `aria-live` regions for run status and toasts,
  keyboard-driven workbench (`A` approve / `R` reject) and a guided tour that also runs on `←`/`→`/`Esc`.

---

## 9. Prototype disclosure (what is real and what is a stand-in)

* This is a **prototype**: the pipeline, matching, scoring, clustering, metrics and exports are real and run live, but
  the production deployment would swap three components:
  * the **surrogate encoder** (`embed.js`) for a fine-tuned Sentence-BERT model over the CPSE material vocabulary —
    the module interface (`embedAll`, `cosine`) stays identical;
  * the **synthetic corpus** (`catalog.js`) for real ERP/material extracts (CSV, database or API);
  * the **illustrative CNMC mapping** (`cnmc.js`) for the official CNMC taxonomy tables.
* The corpus is synthetic and generated deterministically — no real organization's material data is used. Ground truth
  is retained only to score the engine.
* Confidence scores are calibrated on this corpus; production calibration must follow expert-validated ground truth
  from the pilot organization.
* CNMC codes are illustrative mappings for the prototype and must be validated against the official taxonomy before
  production use.

---

## 10. Local development

```bash
# any static file server works; ES modules require http(s), not file://
python3 -m http.server 8080
# then open http://localhost:8080
```

Optional headless test (drives every view and interaction through jsdom):

```bash
npm i jsdom
node scripts/smoke.mjs
```

---

**Team Code Cosmos** · Problem `SIH26099` · *AI-driven, human-in-the-loop harmonization of CPSE material codes.*
