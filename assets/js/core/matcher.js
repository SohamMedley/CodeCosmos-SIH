/**
 * Code Cosmos · Hybrid Matching Intelligence
 * ------------------------------------------------------------------
 * Fuses the three signals the SIH problem statement asks for:
 *
 *   SEMANTIC   cosine similarity over tf-idf concept embeddings
 *   FUZZY      token-set / jaro-winkler / n-gram similarity
 *   TECHNICAL  attribute-by-attribute spec comparison with unit
 *              normalisation and conflict detection
 *
 * …then converts them into a calibrated confidence score and a
 * decision band, and records an auditable explanation for every
 * numeric point of that score. Critical-attribute conflicts (6205 vs
 * 6206, M10 vs M12, DN50 vs DN80) hard-cap confidence so the system
 * never silently merges two different parts — that is the core
 * safety property of the human-in-the-loop design.
 */

import { normalize } from './normalize.js';
import { extractAttributes, specDensity } from './attributes.js';
import { fuzzyScore, prepareFuzzy, jaroWinkler, tokenSetRatio, clamp } from './fuzzy.js';
import { embedAll, cosine, sharedFeatures, featurize } from './embed.js';
import { relDiff, convert } from './units.js';

export const DECISION_BANDS = [
  { id: 'auto', min: 0.85, label: 'Auto-Accept Band', short: 'AUTO', action: 'AI recommendation – straight-through to the standardized master', tone: 'ok', review: false },
  { id: 'probable', min: 0.75, label: 'Probable Equivalent', short: 'PROB', action: 'Fast-track reviewer confirmation', tone: 'info', review: true },
  { id: 'review', min: 0.55, label: 'Expert Review', short: 'REVIEW', action: 'Sent to domain expert queue with full evidence', tone: 'warn', review: true },
  { id: 'reject', min: 0, label: 'Not a Match', short: 'REJECT', action: 'Kept as a distinct material record', tone: 'bad', review: false }
];

export function bandFor(confidence) {
  return DECISION_BANDS.find((b) => confidence >= b.min) || DECISION_BANDS[DECISION_BANDS.length - 1];
}

export const WEIGHTS = { semantic: 0.32, fuzzy: 0.24, attribute: 0.44 };

/** Build the full record object used everywhere in the app. */
export function buildRecord(id, raw, meta = {}) {
  const normalized = normalize(raw, meta);
  const base = { id, raw, normalized, cpse: meta.cpse || null, unit: meta.unit || null, legacyCode: meta.legacyCode || null, criticality: meta.criticality || null, addedOn: meta.addedOn || null, source: meta.source || 'seed' };
  return extractAttributes(base);
}

/** Attribute-vs-attribute comparison with unit-standardised numerics. */
export function compareAttributes(a, b) {
  const matched = [];
  const conflicts = [];
  const missing = [];
  let earned = 0;
  let possible = 0;

  const keys = new Set([...(a.specMap ? a.specMap.keys() : []), ...(b.specMap ? b.specMap.keys() : [])]);
  const GROUP_WEIGHT = { designation: 1.5, dimension: 1.3, material: 1.2, rating: 1.2, grade: 1.0, standard: 0.8 };

  for (const key of keys) {
    const sa = a.specMap ? a.specMap.get(key) : null;
    const sb = b.specMap ? b.specMap.get(key) : null;
    if (!sa || !sb) {
      const only = sa || sb;
      if (only) missing.push({ key, label: only.label, presentIn: sa ? a.cpse || 'A' : b.cpse || 'B' });
      continue;
    }
    const weight = GROUP_WEIGHT[sa.group] || 1;
    possible += weight;

    // ---- numeric comparison on standardised base units -------------------
    if (sa.baseValue !== null && sb.baseValue !== null && sa.quantity === sb.quantity) {
      const diff = relDiff(sa.baseValue, sb.baseValue);
      let reward;
      let verdict;
      if (diff <= 0.005) { reward = 1; verdict = 'match'; }
      else if (diff <= 0.02) { reward = 0.88; verdict = 'match'; }
      else if (diff <= 0.08) { reward = 0.42; verdict = 'approx'; }
      else { reward = 0; verdict = 'conflict'; }

      const paired = sa.secondaryBaseValue !== null && sa.secondaryBaseValue !== undefined
        && sb.secondaryBaseValue !== null && sb.secondaryBaseValue !== undefined;
      let secondaryDetail = '';
      if (paired) {
        const sdiff = relDiff(sa.secondaryBaseValue, sb.secondaryBaseValue);
        if (sdiff > 0.02) {
          verdict = 'conflict';
          reward = 0;
          secondaryDetail = ` · secondary ${fmt(sa.secondaryBaseValue)} vs ${fmt(sb.secondaryBaseValue)} ${sb.secondaryBaseUnit}`;
        } else {
          reward = Math.min(1, reward + 0.05);
        }
      }

      earned += reward * weight;
      const detail = `${fmt(sa.baseValue)} ${sa.baseUnit} vs ${fmt(sb.baseValue)} ${sb.baseUnit}${secondaryDetail}`;
      const entry = { key, label: sa.label, verdict, detail, critical: sa.critical || paired, deviation: diff, asWritten: `${sa.text} vs ${sb.text}` };
      if (verdict === 'conflict') conflicts.push(entry);
      else matched.push(entry);
      continue;
    }

    // ---- material equivalence classes ------------------------------------
    if (key === 'material') {
      const ca = sa.canon || sa.text; const cb = sb.canon || sb.text;
      if (ca === cb) { earned += weight; matched.push({ key, label: sa.label, verdict: 'match', detail: `${ca} = ${cb}` }); }
      else if (sameFamily(ca, cb)) {
        earned += weight * 0.6;
        matched.push({ key, label: sa.label, verdict: 'approx', detail: `${ca} vs ${cb} — same alloy family`, critical: false });
      } else {
        conflicts.push({ key, label: sa.label, verdict: 'conflict', detail: `${ca} vs ${cb} — different material`, critical: true });
      }
      continue;
    }

    // ---- designation / grade / standard / text ---------------------------
    const ta = String(sa.text).toUpperCase();
    const tb = String(sb.text).toUpperCase();
    if (ta === tb) { earned += weight; matched.push({ key, label: sa.label, verdict: 'match', detail: `${ta} = ${tb}` }); continue; }
    const jw = jaroWinkler(ta, tb);
    const digitMismatch = digitSignature(ta) !== digitSignature(tb);
    if (key === 'designation' || key === 'grade' || key === 'efficiencyClass') {
      if (jw >= 0.9 && !digitMismatch) { earned += weight * 0.85; matched.push({ key, label: sa.label, verdict: 'match', detail: `${ta} ≈ ${tb} (formatting variant)` }); }
      else conflicts.push({ key, label: sa.label, verdict: 'conflict', detail: `${ta} vs ${tb} — designation differs`, critical: true });
      continue;
    }
    if (jw >= 0.88) { earned += weight * 0.8; matched.push({ key, label: sa.label, verdict: 'match', detail: `${ta} ≈ ${tb}` }); }
    else if (jw >= 0.7) { earned += weight * 0.45; matched.push({ key, label: sa.label, verdict: 'approx', detail: `${ta} ~ ${tb}` }); }
    else conflicts.push({ key, label: sa.label, verdict: 'conflict', detail: `${ta} vs ${tb}`, critical: sa.critical && sb.critical });
  }

  const score = possible > 0 ? clamp(earned / possible, 0, 1) : null;
  return { score, matched, conflicts, missing, comparable: possible };
}

const ALLOY_FAMILIES = [
  ['SS 304', 'SS 316', 'SS 316L', 'SS'],
  ['MS', 'CS', 'Forged Steel', 'Alloy Steel'],
  ['CI', 'DI', 'GI'],
  ['Aluminium', 'Brass', 'Bronze', 'Copper'],
  ['NBR', 'EPDM', 'Rubber'],
  ['PTFE', 'PU', 'PP', 'PE', 'uPVC', 'CPVC']
];

function sameFamily(a, b) {
  if (!a || !b) return false;
  return ALLOY_FAMILIES.some((fam) => fam.includes(a) && fam.includes(b));
}

function digitSignature(s) {
  return (String(s).match(/\d+/g) || []).join('|');
}

function fmt(v) {
  if (!Number.isFinite(v)) return String(v);
  return Math.abs(v - Math.round(v)) < 0.005 ? String(Math.round(v)) : String(Number(v.toFixed(2)));
}

/**
 * Confidence scoring with conflict-aware caps.
 * @returns {{confidence:number, band:object, scores:object, explanation:Array}}
 */
export function confidence(a, b, semantic, fuzzyResult) {
  const attr = compareAttributes(a, b);
  const hasAttr = attr.score !== null;
  let w = hasAttr ? { ...WEIGHTS } : { semantic: 0.58, fuzzy: 0.42, attribute: 0 };
  const total = w.semantic + w.fuzzy + w.attribute;
  let raw = (semantic * w.semantic + fuzzyResult.score * w.fuzzy + (attr.score || 0) * w.attribute) / total;

  // Density penalty: comparing two very thin records is inherently uncertain.
  const density = Math.min(specDensity(a), specDensity(b));
  if (density < 0.25) raw *= 0.86 + density * 0.5;

  // Exact-after-normalisation: a guaranteed, explainable match.
  const identical = a.normalized.text === b.normalized.text && a.normalized.text.length > 2;
  if (identical) raw = Math.max(raw, 0.975);

  // Critical conflicts hard-cap the decision band.
  const criticalConflicts = attr.conflicts.filter((c) => c.critical);
  const softConflicts = attr.conflicts.filter((c) => !c.critical);
  if (criticalConflicts.length) raw = Math.min(raw * 0.74, 0.57 - Math.min(0.1, (criticalConflicts.length - 1) * 0.04));
  else if (softConflicts.length) raw = raw * 0.94;

  // Evidence asymmetry: a decisive spec present on one side only means the
  // system cannot prove equivalence — route to a human instead of auto-accepting.
  const CRITICAL_KEYS = ['designation', 'thread', 'nominalSize', 'oringSection', 'crossSection', 'angle'];
  const oneSidedCritical = (attr.missing || []).filter((m) => CRITICAL_KEYS.includes(m.key));
  if (!criticalConflicts.length && oneSidedCritical.length) {
    raw = Math.min(raw, 0.895 - Math.min(0.09, (oneSidedCritical.length - 1) * 0.03));
  }
  if (!criticalConflicts.length && !attr.comparable) raw = Math.min(raw, 0.885);

  const value = clamp(raw, 0.01, 0.99);
  const explanation = [];
  explanation.push({ type: 'semantic', label: 'Semantic similarity', detail: `${(semantic * 100).toFixed(1)}% cosine over concept embeddings`, weight: WEIGHTS.semantic });
  explanation.push({
    type: 'fuzzy', label: 'Fuzzy text similarity',
    detail: Object.entries(fuzzyResult.parts).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(' · '),
    weight: WEIGHTS.fuzzy
  });
  explanation.push({
    type: 'attribute', label: 'Technical attribute agreement',
    detail: hasAttr ? `${attr.matched.length} attribute(s) agree, ${attr.conflicts.length} conflict(s), ${attr.missing.length} present on one side only` : 'insufficient structured attributes on both sides — semantic & fuzzy re-weighted',
    weight: WEIGHTS.attribute
  });
  for (const c of criticalConflicts) explanation.push({ type: 'conflict', label: `Critical conflict · ${c.label}`, detail: `${c.detail} → confidence capped`, weight: 0 });
  for (const m of attr.matched.slice(0, 6)) explanation.push({ type: 'match', label: `${m.label} ${m.verdict === 'approx' ? '(near)' : 'matched'}`, detail: m.detail, weight: 0 });

  return {
    confidence: value,
    band: bandFor(value),
    scores: { semantic, fuzzy: fuzzyResult.score, attribute: attr.score },
    explanation,
    conflicts: attr.conflicts,
    criticalConflicts: criticalConflicts.length,
    matched: attr.matched,
    missing: attr.missing,
    oneSidedCritical,
    attributeComparable: attr.comparable,
    identical
  };
}

/**
 * Matching index: embeddings + blocking structures.
 * Blocking keeps candidate generation near-linear so the same code
 * path scales from the 250-record demo to a 100 k-record CPSE extract.
 */
export class MatchIndex {
  constructor(records = []) {
    this.records = [];
    this.byId = new Map();
    if (records.length) this.build(records);
  }

  build(records) {
    this.records = records;
    this.byId = new Map(records.map((r) => [r.id, r]));
    // Position map: avoids O(n) indexOf scans inside the matching loop.
    this.pos = new Map(records.map((r, i) => [r.id, i]));
    this.prepared = records.map((r) => prepareFuzzy(r.normalized.text, r.normalized.tokens));
    const docs = records.map((r) => ({ tokens: r.normalized.tokens, specs: r.specs }));
    const { sparse, dense } = embedAll(docs);
    this.sparse = sparse;
    this.dense = dense;
    this.index = new Map();
    this.strongKeys = new Set();

    records.forEach((rec, i) => {
      const feats = sparse[i];
      for (const [key, weight] of feats) {
        if (!key.startsWith('c:') && !key.startsWith('s:') && !key.startsWith('n:') && !key.startsWith('t:')) continue;
        const strong = key.startsWith('c:') || key.startsWith('s:') || key.startsWith('n:') || weight > 0.25;
        if (!strong) continue;
        this.strongKeys.add(key);
        if (!this.index.has(key)) this.index.set(key, []);
        this.index.get(key).push({ idx: i, weight });
      }
    });
    this.featureTokenEstimate = this.index.size;
    return this;
  }

  sparseFor(recordOrId) {
    const rec = typeof recordOrId === 'string' ? this.byId.get(recordOrId) : recordOrId;
    if (!rec) return null;
    const i = this.pos.get(rec.id);
    return i === undefined ? null : this.sparse[i];
  }

  preparedFor(recordOrId) {
    const rec = typeof recordOrId === 'string' ? this.byId.get(recordOrId) : recordOrId;
    if (!rec) return null;
    const i = this.pos.get(rec.id);
    return i === undefined ? prepareFuzzy(rec.normalized.text, rec.normalized.tokens) : this.prepared[i];
  }

  /** Candidate ids sharing blocking keys, ranked by shared-feature weight. */
  candidates(record, limit = 40) {
    const i = this.pos ? (this.pos.get(record.id) ?? -1) : this.records.indexOf(record);
    const feats = i >= 0 ? this.sparse[i] : featurize(record.normalized.tokens, record.specs);
    const probe = i >= 0 ? feats : (() => {
      // Ad-hoc record (console playground): embed against the corpus statistics.
      const local = embedAll([{ tokens: record.normalized.tokens, specs: record.specs }, ...this.records.map((r) => ({ tokens: r.normalized.tokens, specs: r.specs }))]);
      return local.sparse[0];
    })();

    const acc = new Map();
    for (const [key, weight] of probe) {
      const bucket = this.index.get(key);
      if (!bucket) continue;
      const boost = key.startsWith('s:') ? 2.2 : key.startsWith('n:') ? 1.7 : key.startsWith('c:') ? 1.35 : 1;
      for (const { idx, weight: w } of bucket) {
        if (idx === i) continue;
        acc.set(idx, (acc.get(idx) || 0) + w * weight * boost);
      }
    }
    return [...acc.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, limit)
      .map(([idx, score]) => ({ idx, record: this.records[idx], blockScore: score, sparse: this.sparse[idx] }));
  }

  /** Score one record against another using the full hybrid stack. */
  score(a, b, opts = {}) {
    const sa = this.sparseFor(a) || this.adhocSparse(a);
    const sb = this.sparseFor(b) || this.adhocSparse(b);
    const semantic = cosine(sa, sb);
    const fuzzy = fuzzyScore(this.preparedFor(a), this.preparedFor(b), a.normalized.tokens, b.normalized.tokens);
    const result = confidence(a, b, semantic, fuzzy);
    const shared = sharedFeatures(sa, sb, opts.sharedLimit || 8);
    return { ...result, shared, a, b };
  }

  adhocSparse(record) {
    const docs = [{ tokens: record.normalized.tokens, specs: record.specs }, ...this.records.map((r) => ({ tokens: r.normalized.tokens, specs: r.specs }))];
    return embedAll(docs).sparse[0];
  }

  /** Best matches for an arbitrary record (console playground). */
  query(record, limit = 8) {
    const cands = this.candidates(record, 60);
    const docs = [{ tokens: record.normalized.tokens, specs: record.specs }, ...this.records.map((r) => ({ tokens: r.normalized.tokens, specs: r.specs }))];
    const sp = embedAll(docs).sparse;
    const probe = sp[0];
    const prepProbe = prepareFuzzy(record.normalized.text, record.normalized.tokens);
    return cands
      .map(({ record: other, sparse }) => {
        const semantic = cosine(probe, sparse);
        const fuzzy = fuzzyScore(prepProbe, this.preparedFor(other), record.normalized.tokens, other.normalized.tokens);
        const result = confidence(record, other, semantic, fuzzy);
        return { ...result, shared: sharedFeatures(probe, sparse, 6), other };
      })
      .sort((x, y) => y.confidence - x.confidence)
      .slice(0, limit);
  }

  /**
   * Generate ranked candidate pairs for a dataset.
   * Blocking + top-k pruning mirrors the production batch job.
   */
  candidatePairs({ maxPairsPerRecord = 8, minScore = 0.35 } = {}) {
    const seen = new Set();
    const pairs = [];
    this.records.forEach((rec, i) => {
      const cands = this.candidates(rec, 28).filter((c) => c.blockScore >= minScore);
      let kept = 0;
      for (const c of cands) {
        const j = this.records.indexOf(c.record);
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seen.has(key)) continue;
        const scored = this.score(rec, c.record);
        if (scored.confidence < 0.30) continue;
        seen.add(key);
        pairs.push({ i: Math.min(i, j), j: Math.max(i, j), ...scored });
        if (++kept >= maxPairsPerRecord) break;
      }
    });
    return pairs.sort((a, b) => b.confidence - a.confidence);
  }
}

/** Unit-standardisation showcase used by the UI explainer. */
export function unitEquivalenceTable() {
  const samples = [
    ['length', '50 mm', '5 cm', 50, 'mm'],
    ['length', '2 inch', '50.8 mm', 50.8, 'mm'],
    ['length', 'DN50', '50 mm nominal bore', 50, 'mm'],
    ['mass', '1.5 t', '1500 kg', 1500, 'kg'],
    ['pressure', '10 bar', '1000 kPa', 1000, 'kPa'],
    ['pressure', '150 psi', '1034.2 kPa', 1034.2, 'kPa'],
    ['power', '5 HP', '3.73 kW', 3.7285, 'kW'],
    ['flow', '10 LPM', '0.6 m³/h', 10, 'LPM']
  ];
  return samples.map(([quantity, asWritten, asStandard, baseValue, baseUnit]) => ({
    quantity, asWritten, asStandard, baseValue, baseUnit
  }));
}

export { convert };
