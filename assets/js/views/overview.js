/**
 * Code Cosmos · Overview view
 * Cinematic landing: the problem, the live pipeline, the response map.
 */

import { h, clear, qs, countUp, toast, fmtPct, fmtInt, fmtMs } from '../components/ui.js';
import { STAGES } from '../core/pipeline.js';
import { SHOWCASES } from '../data/catalog.js';

const GAPS = [
  ['Inconsistent descriptions across CPSEs', 'Text normalization + semantic embeddings'],
  ['Duplicate & legacy material records', 'Semantic + fuzzy matching'],
  ['Unstructured technical attributes in free text', 'Attribute extraction + unit standardization'],
  ['Manual, time-consuming record review', 'Automated candidate comparison'],
  ['Uncertain AI recommendations', 'Confidence scoring + expert validation'],
  ['Lack of standardized material mapping', 'CNMC harmonization + validated master']
];

const FLOW = [
  'CPSE material records (raw, legacy, inconsistent)',
  'Data cleaning & text normalization',
  'Technical attribute extraction',
  'Unit standardization (SI base units)',
  'Semantic embedding generation',
  'Fuzzy + semantic + technical matching',
  'Duplicate / near-duplicate detection',
  'Candidate standard material identification',
  'Confidence scoring',
  'High confidence → AI recommendation',
  'Low confidence → expert validation',
  'Validated material master',
  'CNMC code harmonization / recommendation',
  'Reusable standardized material knowledge base'
];

const KNOWLEDGE_LOOP = ['Historical CPSE data', 'AI processing', 'Expert validation', 'Standardized knowledge', 'Future matching starts calibrated'];

export function initOverview(store) {
  const root = qs('#view-overview');
  renderStatic();
  renderTicker();

  const ring = qs('#heroRing');
  const CIRC = 2 * Math.PI * 52;

  function setProgress(p) {
    const pct = Math.max(0, Math.min(100, p.pct || 0));
    if (ring) {
      ring.style.strokeDasharray = String(CIRC);
      ring.style.strokeDashoffset = String(CIRC * (1 - pct / 100));
    }
    qs('#heroPct').textContent = `${Math.round(pct)}%`;
    const meta = p.stageMeta;
    qs('#heroStageName').textContent = meta ? `stage ${meta.index}` : (pct >= 100 ? 'complete' : 'running');
    qs('#heroStageDetail').textContent = p.detail || '—';
    const list = qs('#heroStageList');
    clear(list);
    STAGES.forEach((s) => {
      const st = p.stages[s.id] || 0;
      const cls = st >= 100 ? 'done' : (p.stage === s.id ? 'active' : '');
      list.append(h('li', { class: cls }, h('i'), h('span', { text: `${s.index}. ${s.short}` })));
    });
  }

  function setStatus(status) {
    const chip = qs('#heroStatus');
    const label = qs('#engineChip .pulse') ? qs('#engineLabel') : null;
    const nice = { idle: 'idle', running: 'processing', ready: 'ready' }[status] || status;
    if (chip) chip.textContent = nice;
    if (label) label.textContent = nice === 'processing' ? 'Processing' : nice === 'ready' ? 'Engine ready' : 'Idle';
  }

  store.on('progress', setProgress);
  store.on('status', (e) => setStatus(e.status || e));
  store.on('complete', (snap) => {
    setStatus('ready');
    renderOutcome(snap, store);
  });
  store.on('dataset', () => {
    qs('#heroStageDetail').textContent = 'Dataset generated · engine ready';
  });

  qs('#heroRun').addEventListener('click', () => store.run().catch((e) => toast('bad', 'Pipeline error', String(e.message || e))));
  setStatus('idle');
}

function renderStatic() {
  const gapHost = qs('#gapList');
  clear(gapHost);
  GAPS.forEach(([problem, fix]) => {
    gapHost.append(h('li', {},
      h('span', { class: 'gap-problem', text: problem }),
      h('span', { class: 'gap-arrow', text: '→' }),
      h('span', { class: 'gap-fix', text: fix })
    ));
  });

  const flow = qs('#flowList');
  clear(flow);
  FLOW.forEach((step) => flow.append(h('li', { class: step.includes('→') ? 'branch' : '', text: step })));

  const loop = qs('#knowledgeLoop');
  clear(loop);
  KNOWLEDGE_LOOP.forEach((node, i) => {
    loop.append(h('div', { class: 'kl-node', style: { animationDelay: `${i * 0.08}s` } }, h('i'), h('span', { text: node })));
    if (i < KNOWLEDGE_LOOP.length - 1) loop.append(h('span', { class: 'kl-arrow', text: '↻' }));
  });
}

function renderTicker() {
  const track = qs('#tickerTrack');
  if (!track) return;
  const items = [];
  const repeats = 2;   // exactly two copies → seamless -50% marquee loop
  for (let r = 0; r < repeats; r++) {
    SHOWCASES.forEach((s) => items.push(h('span', {}, h('b', { text: s.raw }))));
  }
  clear(track);
  items.forEach((i) => track.append(i));
}

function renderOutcome(snap, store) {
  const m = snap.metrics;
  countUp(qs('#kpiRows'), m.records);
  countUp(qs('#kpiPairs'), m.candidatePairs);
  countUp(qs('#kpiDupes'), m.duplicateRecords);
  countUp(qs('#kpiReview'), m.reviewQueue);

  const autoPct = m.candidatePairs ? m.autoCount / m.candidatePairs : 0;
  qs('#sideAuto').textContent = fmtPct(autoPct, 0);
  qs('#sideAutoBar').style.width = `${Math.min(100, autoPct * 100)}%`;

  qs('#impactSpeed').textContent =
    `${fmtNum(m.estimatedManualHours)} h of exhaustive manual comparison collapses to ${fmtNum(m.estimatedAssistedHours)} h of assisted review — a ${fmtPct(m.reviewWorkloadReduction, 1)} reduction, with ${fmtInt(m.autoCount)} pairs decided inside the auto-accept band.`;
  qs('#impactDupes').textContent =
    `${fmtInt(m.duplicateRecords)} of ${fmtInt(m.records)} legacy rows collapse into ${fmtInt(m.clusters)} canonical engineering items across ${fmtInt(new Set(snap.records.map((r) => r.cpse)).size)} CPSEs. Cluster purity: ${fmtPct(m.clusterPurity, 1)}.`;
  qs('#impactAccuracy').textContent =
    `Precision ${fmtPct(m.precision, 1)} · Recall ${fmtPct(m.recall, 1)} · F1 ${fmtPct(m.f1, 1)} at the configured operating point, measured against known ground truth in ${fmtMs(m.durationMs)}.`;
  qs('#impactMap').textContent =
    `${fmtInt(snap.masterItems.length)} standard material master items generated with CNMC class mapping and single-unit-of-measure normalization — reusable for every future matching run.`;
  document.querySelectorAll('.impact-bar i').forEach((bar, i) => {
    const widths = [m.reviewWorkloadReduction, m.duplicateRecords / Math.max(1, m.records), m.precision, m.clusterPurity];
    bar.style.width = `${Math.min(100, Math.max(6, (widths[i] || 0.6) * 100))}%`;
  });

  const stats = qs('#knowledgeStats');
  clear(stats);
  const items = [
    ['Validated master items', fmtInt(snap.masterItems.length), 'one per engineering item'],
    ['CNMC classes covered', fmtInt(new Set(snap.masterItems.map((x) => x.classCode)).size), 'auto-mapped taxonomy'],
    ['Ground-truth concepts', fmtInt(store.dataset ? store.dataset.concepts.size : m.clusters), 'hidden from the matcher'],
    ['Engine runtime', fmtMs(m.durationMs), 'fully in-browser']
  ];
  items.forEach(([label, value, detail]) => {
    stats.append(h('div', { class: 'kpi-card' },
      h('span', { class: 'kl', text: label }),
      h('span', { class: 'kv', text: value }),
      h('span', { class: 'kd', text: detail })
    ));
  });
}

function fmtNum(v) {
  return Number.isFinite(v) ? v.toFixed(v < 10 ? 2 : 1) : '—';
}
