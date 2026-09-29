/**
 * Code Cosmos · Harmonization Pipeline Orchestrator
 * ------------------------------------------------------------------
 * Raw CPSE rows
 *   → 1 Text normalization
 *   → 2 Technical attribute extraction
 *   → 3 Unit standardization
 *   → 4 Semantic embedding
 *   → 5 Fuzzy + semantic + technical matching
 *   → 6 Duplicate / near-duplicate detection
 *   → 7 Confidence scoring & decision bands
 *   → 8 Human validation queue
 *   → 9 CNMC harmonization & standardized material master
 *
 * Every stage is chunked across animation frames so the browser stays
 * responsive and the UI can visualise throughput live.
 */

import { buildRecord, MatchIndex, bandFor, DECISION_BANDS, confidence as confidenceScore, WEIGHTS } from './matcher.js';
import { fuzzyScore } from './fuzzy.js';
import { generateDataset } from '../data/catalog.js';
import { recommend, classFor } from './cnmc.js';
import { specDensity } from './attributes.js';
import { project2D } from './embed.js';

export const STAGES = [
  { id: 'ingest', index: 1, label: 'Data Cleaning & Text Normalization', short: 'Normalize', icon: '⌘', detail: 'Case folding, unicode repair, shorthand expansion, vendor & part-number neutralisation' },
  { id: 'attributes', index: 2, label: 'Technical Attribute Extraction', short: 'Extract', icon: '⌗', detail: 'Designation, material, grade, dimension, pressure and rating slots filled from unstructured text' },
  { id: 'units', index: 3, label: 'Unit Standardization', short: 'Standardize', icon: '⇄', detail: 'Every numeric attribute converted to the SI base unit of its quantity so 50 mm = 5 cm = 2 inch' },
  { id: 'embed', index: 4, label: 'Semantic Embedding Generation', short: 'Embed', icon: '◈', detail: 'Concept-level tf-idf embeddings (Sentence-BERT surrogate) built over the CPSE material vocabulary' },
  { id: 'match', index: 5, label: 'Hybrid Matching (Semantic + Fuzzy + Technical)', short: 'Match', icon: '⋈', detail: 'Blocked candidate generation followed by tri-signal scoring of every candidate pair' },
  { id: 'detect', index: 6, label: 'Duplicate & Near-Duplicate Detection', short: 'Detect', icon: '⊕', detail: 'Transitive clustering of accepted matches into one engineering item per material' },
  { id: 'score', index: 7, label: 'Confidence Scoring & Decision Bands', short: 'Score', icon: '◑', detail: 'Calibrated confidence with critical-attribute conflict caps and an auditable explanation trail' },
  { id: 'validate', index: 8, label: 'Human Validation Queue', short: 'Validate', icon: '✓', detail: 'High confidence flows through; uncertain cases routed to domain experts with evidence attached' },
  { id: 'cnmc', index: 9, label: 'CNMC Harmonization & Material Master', short: 'Harmonize', icon: '▤', detail: 'One standard description, one CNMC code, one UOM per validated engineering item' },
  { id: 'knowledge', index: 10, label: 'Reusable Standardized Knowledge Base', short: 'Knowledge', icon: '✦', detail: 'Validated mappings are retained so future matching starts already calibrated' }
];

const CONFIG_DEFAULTS = {
  size: 260,
  seed: 20260129,
  weights: { ...WEIGHTS },
  autoAccept: 0.85,
  reviewFloor: 0.55,
  candidateLimit: 28,
  maxPairsPerRecord: 8,
  useAttributes: true,
  useFuzzy: true,
  useUnits: true,
  includeShowcases: true
};

function tick() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function' && typeof document !== 'undefined') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export class Pipeline {
  constructor(config = {}) {
    this.config = { ...CONFIG_DEFAULTS, ...config, weights: { ...CONFIG_DEFAULTS.weights, ...(config.weights || {}) } };
    this.listeners = new Set();
    this.records = [];
    this.pairs = [];
    this.clusters = [];
    this.index = null;
    this.decisions = new Map();
    this.status = 'idle';
    this.progress = { stage: null, pct: 0, detail: '', stages: {} };
    this.metrics = null;
    this.auditLog = [];
    this.durationMs = 0;
    this.masterItems = [];
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(type, payload) {
    for (const fn of this.listeners) fn(type, payload, this);
  }

  setProgress(stage, pct, detail) {
    if (stage) {
      this.progress.stages[stage] = Math.max(this.progress.stages[stage] || 0, pct);
      this.progress.stage = stage;
    }
    if (pct !== undefined) this.progress.pct = pct;
    this.progress.detail = detail || this.progress.detail;
    this.emit('progress', { ...this.progress, stageMeta: STAGES.find((s) => s.id === stage) || null });
  }

  log(action, detail, tone = 'info') {
    this.auditLog.unshift({ id: `A${this.auditLog.length + 1}`, at: new Date(), action, detail, tone });
    if (this.auditLog.length > 120) this.auditLog.pop();
    this.emit('audit', this.auditLog[0]);
  }

  /* ---------------------------------------------------------------- */

  async run(data) {
    const t0 = performance.now();
    this.reset();
    this.status = 'running';
    this.emit('status', this.status);

    const dataset = data || generateDataset({ size: this.config.size, seed: this.config.seed, includeShowcases: this.config.includeShowcases });
    this.dataset = dataset;
    this.emit('dataset', dataset);

    await this.stageIngest(dataset.rows);
    await this.stageAttributes();
    await this.stageUnits();
    await this.stageEmbed();
    await this.stageMatch();
    await this.stageDetect();
    await this.stageScore();
    await this.stageHarmonize();

    this.durationMs = performance.now() - t0;
    this.status = 'ready';
    this.setProgress(null, 100, `Pipeline complete · ${this.records.length} records · ${this.durationMs.toFixed(0)} ms`);
    this.log('Pipeline completed', `${this.records.length} records harmonized in ${this.durationMs.toFixed(0)} ms · ${this.pairs.length} candidate pairs`, 'ok');
    this.emit('status', this.status);
    this.emit('complete', this.snapshot());
    return this.snapshot();
  }

  reset() {
    this.records = [];
    this.pairs = [];
    this.clusters = [];
    this.index = null;
    this.decisions = new Map();
    this.auditLog = [];
    this.progress = { stage: null, pct: 0, detail: '', stages: {} };
    this.masterItems = [];
  }

  async stageIngest(rows) {
    this.records = [];
    const CHUNK = 40;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      this.records.push(buildRecord(r.id, r.raw, {
        cpse: r.cpse, unit: r.unit, legacyCode: r.legacyCode,
        criticality: r.criticality, addedOn: r.addedOn, source: r.source || 'generated'
      }));
      if (i % CHUNK === 0) {
        this.setProgress('ingest', (i / rows.length) * 100, `Cleaning description ${i + 1} / ${rows.length}`);
        await tick();
      }
    }
    this.records.forEach((rec, i) => { rec.conceptId = rows[i].conceptId; });
    this.setProgress('ingest', 100, `Normalized ${rows.length} legacy descriptions`);
    this.log('Stage 1 · Normalization', `${rows.length} raw descriptions cleaned and tokenised`);
    this.emit('records', this.records);
  }

  async stageAttributes() {
    const CHUNK = 60;
    for (let i = 0; i < this.records.length; i++) {
      if (i % CHUNK === 0) {
        this.setProgress('attributes', (i / this.records.length) * 100, `Extracting attributes ${i + 1} / ${this.records.length}`);
        await tick();
      }
    }
    const totalSpecs = this.records.reduce((n, r) => n + r.specs.length, 0);
    this.setProgress('attributes', 100, `${totalSpecs} technical attributes extracted`);
    this.log('Stage 2 · Attribute extraction', `${totalSpecs} structured attributes recovered from free text`);
    this.emit('records', this.records);
  }

  async stageUnits() {
    const converted = this.records.reduce((n, r) => n + r.specs.filter((s) => s.baseValue !== null && s.unit && s.unit.toLowerCase() !== String(s.baseUnit).toLowerCase()).length, 0);
    this.setProgress('units', 40, `Standardising ${converted} non-SI values …`);
    await tick();
    this.setProgress('units', 100, `${converted} values converted to SI base units`);
    this.log('Stage 3 · Unit standardization', `${converted} values normalised (mm/cm/inch, bar/psi/kPa, HP/kW …)`);
  }

  async stageEmbed() {
    this.setProgress('embed', 15, 'Building concept vocabulary & tf-idf statistics …');
    await tick();
    this.index = new MatchIndex(this.records);
    this.prepared = this.index.prepared;
    this.setProgress('embed', 70, `Projecting ${this.records.length} descriptions into embedding space …`);
    await tick();
    this.points2d = project2D(this.index.dense);
    this.setProgress('embed', 100, `${this.records.length} records · ${this.index.dim}-d embeddings · ${this.index.featureTokenEstimate} concept features`);
    this.log('Stage 4 · Semantic embeddings', `${this.records.length} records embedded, ${this.index.featureTokenEstimate} discriminative features retained`);
    this.emit('embedded', { points: this.points2d });
  }

  async stageMatch() {
    const total = this.records.length;
    const pairs = [];
    const seen = new Set();
    const limit = this.config.candidateLimit;
    for (let i = 0; i < total; i++) {
      const rec = this.records[i];
      const cands = this.index.candidates(rec, limit);
      let kept = 0;
      for (const c of cands) {
        const j = c.idx;
        if (j === undefined) continue;
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key)) continue;
        const scored = this.scorePair(rec, c.record, i, j);
        if (scored.confidence < 0.28) continue;
        seen.add(key);
        pairs.push({ key, i: Math.min(i, j), j: Math.max(i, j), a: rec, b: c.record, ...scored });
        if (++kept >= this.config.maxPairsPerRecord) break;
      }
      if (i % 12 === 0) {
        this.setProgress('match', (i / total) * 100, `Scoring candidates for record ${i + 1} / ${total} · ${pairs.length} pairs retained`);
        await tick();
      }
    }
    this.pairs = pairs.sort((a, b) => b.confidence - a.confidence);
    this.setProgress('match', 100, `${this.pairs.length} candidate pairs scored`);
    this.log('Stage 5 · Hybrid matching', `${this.pairs.length} candidate pairs generated from ${(total * (total - 1) / 2).toLocaleString()} possible combinations (${(100 - (this.pairs.length / Math.max(1, total * (total - 1) / 2)) * 100).toFixed(2)}% reduction)`);
    this.emit('pairs', this.pairs);
  }

  scorePair(a, b, ai, bi) {
    const cfg = this.config;
    const idx = this.index;
    const sa = idx.sparse[ai] || idx.sparseFor(a) || idx.adhocSparse(a);
    const sb = idx.sparse[bi] || idx.sparseFor(b) || idx.adhocSparse(b);
    let semantic = 0;
    for (const [k, w] of (sa.size <= sb.size ? sa : sb)) {
      const o = (sa.size <= sb.size ? sb : sa).get(k);
      if (o !== undefined) semantic += w * o;
    }
    semantic = Math.max(0, Math.min(1, semantic));

    // Re-weight the signals when a user disables one in the console.
    const wBase = cfg.weights;
    const w = {
      semantic: wBase.semantic,
      fuzzy: cfg.useFuzzy ? wBase.fuzzy : 0,
      attribute: cfg.useAttributes ? wBase.attribute : 0
    };
    const sum = w.semantic + w.fuzzy + w.attribute || 1;

    const fz = fuzzyScore(idx.prepared[ai] || idx.preparedFor(a), idx.prepared[bi] || idx.preparedFor(b), a.normalized.tokens, b.normalized.tokens);
    const result = confidenceScore(a, b, semantic, fz);
    const weighted = (semantic * w.semantic + fz.score * w.fuzzy + (result.scores.attribute || 0) * w.attribute) / sum;
    const conflictCapped = result.criticalConflicts.length ? Math.min(weighted * 0.74, 0.57) : weighted * (result.conflicts.length ? 0.94 : 1);
    const final = result.identical ? Math.max(conflictCapped, 0.975) : conflictCapped;
    const confidence = Math.max(0.01, Math.min(0.99, final));

    return {
      ...result,
      confidence,
      band: bandFor(confidence),
      scores: { semantic, fuzzy: fz.score, attribute: result.scores.attribute },
      semanticRaw: semantic
    };
  }

  /* ------------------------------------------------------------------ */

  async stageDetect() {
    this.setProgress('detect', 10, 'Building transitive duplicate clusters …');
    await tick();
    this.rebuildClusters();
    const dupes = this.records.length - this.clusters.length;
    this.setProgress('detect', 100, `${this.clusters.length} engineering items · ${dupes} duplicate records identified`);
    this.log('Stage 6 · Duplicate detection', `${this.clusters.length} canonical items found across ${this.records.length} records`);
    this.emit('clusters', this.clusters);
  }

  async stageScore() {
    const bands = DECISION_BANDS.map((b) => ({ ...b, count: this.pairs.filter((p) => p.band.id === b.id).length }));
    this.setProgress('score', 60, 'Calibrating confidence bands …');
    await tick();
    this.bandDistribution = bands;
    this.setProgress('score', 100, `${bands[0].count} auto-accepted · ${bands[1].count + bands[2].count} queued for review`);
    this.log('Stage 7 · Confidence scoring', `${bands[0].count} pairs in auto-accept band, ${bands[1].count + bands[2].count} routed to experts`);
  }

  async stageHarmonize() {
    this.setProgress('cnmc', 20, 'Assigning CNMC classes and standard master descriptions …');
    await tick();
    this.buildMasterItems();
    this.setProgress('knowledge', 60, 'Writing validated mappings to the reusable knowledge base …');
    await tick();
    this.setProgress('cnmc', 100, `${this.masterItems.length} standard material master items generated`);
    this.log('Stage 8/9 · Harmonization', `${this.masterItems.length} CNMC-mapped master items in the standardized knowledge base`, 'ok');
    this.metrics = this.computeMetrics();
    this.emit('master', this.masterItems);
  }

  /** One standardized master item per validated cluster, with a stable CNMC code. */
  buildMasterItems() {
    const previous = new Map((this.masterItems || []).map((m) => [m.memberIds.join(','), m.id]));
    this.masterItems = this.clusters.map((c, i) => {
      const master = c.members.reduce((best, r) => (specDensity(r) > specDensity(best) ? r : best), c.members[0]);
      const rec = recommend(master, { autoCode: true, confidence: c.cohesion });
      return {
        id: previous.get(c.memberIds.join(',')) || `ITEM-${String(i + 1).padStart(4, '0')}`,
        code: rec.code,
        classLabel: rec.classLabel,
        classCode: rec.classCode,
        type: master.type,
        family: master.family,
        standardDescription: rec.standardDescription,
        unit: rec.unit,
        masterRecord: master,
        memberIds: c.memberIds,
        members: c.members,
        cohesion: c.cohesion,
        cpseSpread: c.cpseSpread,
        duplicatesRemoved: c.members.length - 1,
        completeness: rec.completeness,
        missingCritical: rec.missingCritical,
        legacyCodes: c.members.map((m) => `${m.cpse}:${m.legacyCode}`).slice(0, 5)
      };
    });
    this.emit('master', this.masterItems);
    return this.masterItems;
  }

  /* ------------------------------------------------------------------ */

  rebuildClusters() {
    const parent = new Map(this.records.map((r) => [r.id, r.id]));
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb); };

    const accepted = this.pairs.filter((p) => this.decisionFor(p) === 'accepted');
    for (const p of accepted) union(this.records[p.i].id, this.records[p.j].id);

    const groups = new Map();
    for (const rec of this.records) {
      const root = find(rec.id);
      if (!groups.has(root)) groups.set(root, []);
      groups.get(root).push(rec);
    }

    const clusters = [];
    groups.forEach((members, root) => {
      const ids = new Set(members.map((m) => m.id));
      const edges = accepted.filter((p) => ids.has(this.records[p.i].id) && ids.has(this.records[p.j].id));
      const cohesion = edges.length ? edges.reduce((s, e) => s + e.confidence, 0) / edges.length : 1;
      const cpseSpread = new Set(members.map((m) => m.cpse)).size;
      clusters.push({
        id: root,
        memberIds: members.map((m) => m.id),
        members,
        cohesion,
        cpseSpread,
        edgeCount: edges.length,
        family: members[0].family,
        size: members.length
      });
    });
    clusters.sort((a, b) => b.size - a.size || b.cohesion - a.cohesion);
    this.clusters = clusters;
  }

  decisionFor(pair) {
    const decided = this.decisions.get(pair.key);
    if (decided) return decided;
    return pair.confidence >= this.config.autoAccept ? 'accepted' : 'pending';
  }

  /** Human-in-the-loop decision. */
  decide(pairKeyValue, verdict, reviewer = 'Domain Expert') {
    const pair = this.pairs.find((p) => p.key === pairKeyValue);
    if (!pair) return;
    this.decisions.set(pairKeyValue, verdict);
    this.log(
      verdict === 'accepted' ? 'Match approved' : 'Match rejected',
      `${pair.a.legacyCode || pair.a.id} ↔ ${pair.b.legacyCode || pair.b.id} · confidence ${(pair.confidence * 100).toFixed(1)}% · ${reviewer}`,
      verdict === 'accepted' ? 'ok' : 'warn'
    );
    this.rebuildClusters();
    this.buildMasterItems();
    this.metrics = this.computeMetrics();
    this.emit('decision', { pair, verdict });
    this.emit('clusters', this.clusters);
  }

  /* ------------------------------------------------------------------ */

  computeMetrics() {
    const records = this.records;
    const byConcept = new Map();
    for (const r of records) {
      if (!byConcept.has(r.conceptId)) byConcept.set(r.conceptId, []);
      byConcept.get(r.conceptId).push(r.id);
    }
    let totalTruePairs = 0;
    for (const ids of byConcept.values()) totalTruePairs += (ids.length * (ids.length - 1)) / 2;

    const isTruePair = (p) => records[p.i].conceptId === records[p.j].conceptId;

    const sweep = [];
    for (let t = 0.5; t <= 0.951; t += 0.05) {
      const threshold = Number(t.toFixed(2));
      const above = this.pairs.filter((p) => p.confidence >= threshold);
      const tp = above.filter(isTruePair).length;
      const fp = above.length - tp;
      const fn = totalTruePairs - tp;
      const precision = above.length ? tp / above.length : 0;
      const recall = totalTruePairs ? tp / totalTruePairs : 0;
      const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
      sweep.push({ threshold, tp, fp, fn, precision, recall, f1, flagged: above.length });
    }

    const auto = this.pairs.filter((p) => p.confidence >= this.config.autoAccept);
    const autoTP = auto.filter(isTruePair).length;
    const autoFP = auto.length - autoTP;
    const operating = sweep.find((s) => Math.abs(s.threshold - this.config.autoAccept) < 0.026) || sweep[sweep.length - 1];
    const reviewQueue = this.pairs.filter((p) => p.confidence >= this.config.reviewFloor && p.confidence < this.config.autoAccept);

    const possiblePairs = (records.length * (records.length - 1)) / 2;
    const manualMinutes = possiblePairs * 0.35;                    // ~21 s per manual eyeball comparison
    const assistedMinutes = this.pairs.length * 0.12 + reviewQueue.length * 1.15;
    const autoRate = this.pairs.length ? auto.length / this.pairs.length : 0;

    const decisionAccuracy = (() => {
      const decided = this.pairs.filter((p) => this.decisions.has(p.key));
      if (!decided.length) return null;
      const correct = decided.filter((p) => {
        const d = this.decisions.get(p.key);
        return (d === 'accepted') === isTruePair(p);
      }).length;
      return correct / decided.length;
    })();

    const clustersCorrect = this.clusters.filter((c) => new Set(c.members.map((m) => m.conceptId)).size === 1).length;

    const analytics = {
      byFamily: this.familyDistribution(),
      byCpse: this.cpseDistribution(),
      byBand: DECISION_BANDS.map((b) => ({ ...b, count: this.pairs.filter((p) => p.band.id === b.id).length, value: this.pairs.filter((p) => p.band.id === b.id).length })),
      confidenceHistogram: histogram(this.pairs.map((p) => p.confidence), 10),
      attributeHistogram: histogram(this.records.map((r) => r.specs.length), 8),
      signalAverages: {
        semantic: mean(this.pairs.map((p) => p.scores.semantic)),
        fuzzy: mean(this.pairs.map((p) => p.scores.fuzzy)),
        attribute: mean(this.pairs.filter((p) => p.scores.attribute !== null).map((p) => p.scores.attribute))
      },
      unitVariants: this.records.reduce((n, r) => n + r.specs.filter((s) => s.unit && s.baseUnit && String(s.unit).toLowerCase() !== String(s.baseUnit).toLowerCase()).length, 0),
      brandNeutralised: this.records.filter((r) => r.normalized.brand).length,
      noiseRuleHits: this.noiseRuleHits(),
      clusterSizes: histogram(this.clusters.map((c) => c.size), 6)
    };

    const metrics = {
      records: records.length,
      candidatePairs: this.pairs.length,
      possiblePairs,
      blockingReduction: possiblePairs ? 1 - this.pairs.length / possiblePairs : 0,
      totalTruePairs,
      precision: operating.precision,
      recall: operating.recall,
      f1: operating.f1,
      sweep,
      autoCount: auto.length,
      autoRate,
      autoFalseMerges: autoFP,
      autoTrueMatches: autoTP,
      reviewQueue: reviewQueue.length,
      reviewWorkloadReduction: 1 - (assistedMinutes / Math.max(1, manualMinutes)),
      estimatedManualHours: manualMinutes / 60,
      estimatedAssistedHours: assistedMinutes / 60,
      clusters: this.clusters.length,
      duplicateRecords: records.length - this.clusters.length,
      pureClusters: clustersCorrect,
      clusterPurity: this.clusters.length ? clustersCorrect / this.clusters.length : 0,
      decisionAccuracy,
      analytics,
      durationMs: this.durationMs
    };
    return metrics;
  }

  familyDistribution() {
    const counts = new Map();
    for (const r of this.records) {
      const key = r.family ? r.family.id : 'unclassified';
      if (!counts.has(key)) counts.set(key, { id: key, label: r.family ? r.family.label : 'Unclassified', cnmc: r.family ? r.family.cnmc : '99-99', count: 0 });
      counts.get(key).count += 1;
    }
    return [...counts.values()].sort((a, b) => b.count - a.count);
  }

  cpseDistribution() {
    const counts = new Map();
    for (const r of this.records) counts.set(r.cpse, (counts.get(r.cpse) || 0) + 1);
    return [...counts.entries()].map(([label, count]) => ({ label, count, value: count })).sort((a, b) => b.count - a.count);
  }

  noiseRuleHits() {
    const hits = new Map();
    for (const r of this.records) {
      for (const rule of r.normalized.rules) hits.set(rule, (hits.get(rule) || 0) + 1);
    }
    return [...hits.entries()].map(([rule, count]) => ({ rule, count })).sort((a, b) => b.count - a.count);
  }

  /** Records a user should look at next: highest uncertainty × impact. */
  reviewQueue(limit = 40) {
    return this.pairs
      .filter((p) => !this.decisions.has(p.key))
      .filter((p) => p.confidence >= this.config.reviewFloor && p.confidence < this.config.autoAccept + 0.06)
      .sort((a, b) => Math.abs(a.confidence - 0.78) - Math.abs(b.confidence - 0.78))
      .slice(0, limit);
  }

  search(query, limit = 30) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const terms = q.split(/\s+/);
    const scored = [];
    for (const rec of this.records) {
      const hay = `${rec.raw} ${rec.normalized.text} ${rec.legacyCode} ${rec.cpse}`.toLowerCase();
      let score = 0;
      for (const t of terms) if (hay.includes(t)) score += 1;
      if (hay.includes(q)) score += 1.5;
      if (score > 0) scored.push({ record: rec, score });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.record);
  }

  snapshot() {
    return {
      status: this.status,
      records: this.records,
      pairs: this.pairs,
      clusters: this.clusters,
      masterItems: this.masterItems,
      metrics: this.metrics || (this.metrics = this.computeMetrics()),
      progress: this.progress,
      durationMs: this.durationMs,
      config: this.config,
      auditLog: this.auditLog
    };
  }
}

/* ------------------------------- helpers ------------------------------- */

export function histogram(values, bins = 10) {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min) / bins || 1;
  const out = Array.from({ length: bins }, (_, i) => ({
    bin: [min + i * width, min + (i + 1) * width],
    count: 0
  }));
  for (const v of values) {
    let idx = Math.floor((v - min) / width);
    if (idx >= bins) idx = bins - 1;
    if (idx < 0) idx = 0;
    out[idx].count += 1;
  }
  return out;
}

export function mean(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export { classFor };
