/**
 * Code Cosmos · Guided tour
 * ------------------------------------------------------------------
 * A narration-driven walkthrough of the pipeline and the evidence
 * views. Each stop navigates the app and explains what the evaluator
 * is looking at — useful when a judge has three minutes.
 * Arrow keys / buttons step through; Esc ends the tour.
 */

import { h, qs, icon } from './ui.js';

const STOPS = [
  {
    view: 'overview',
    title: 'The problem',
    body: 'Four CPSEs, one bearing, four different descriptions. Exact text comparison sees four materials; this engine sees one engineering item. Press “Run live harmonization” at any time to regenerate the corpus and re-run every stage.'
  },
  {
    view: 'pipeline',
    title: 'Nine stages, running live',
    body: 'Normalization → attribute extraction → unit standardization → embeddings → hybrid matching → duplicate detection → confidence scoring → human validation → CNMC harmonization. Every number shown was measured during this browser session.'
  },
  {
    view: 'workbench',
    title: 'Why the AI thinks so',
    body: 'Two records side by side: the raw text, what normalization removed, the technical attributes recovered, and the three signal scores that fuse into one confidence value. The live console at the bottom analyses any description you type.'
  },
  {
    view: 'benchmark',
    title: 'Proof, not claims',
    body: 'Ground truth is hidden inside the synthetic corpus, so precision, recall, F1 and cluster purity are measured rather than asserted. Drag the operating-point slider to trade recall against zero false merges.'
  },
  {
    view: 'review',
    title: 'Humans stay in the loop',
    body: 'Only the uncertain band reaches an expert. Approve with A, reject with R — the clusters, the material master and the metrics update instantly, and the decision is written to the audit log.'
  },
  {
    view: 'master',
    title: 'The standardized master',
    body: 'One validated item per engineering concept, each with a generated CNMC code, a single standard description and one unit of measure. Exportable as CSV or JSON with full source traceability.'
  },
  {
    view: 'console',
    title: 'Fully tunable',
    body: 'Corpus size and seed, signal weights, decision thresholds, the unit equivalence table and a rule inspector showing the live normalization and extraction result for any string you type.'
  },
  {
    view: 'about',
    title: 'Team, research & disclosure',
    body: 'Differentiation against existing research, the architecture, the roadmap, and an honest statement of what is production-ready versus what is a deliberate stand-in inside this prototype.'
  }
];

const state = { index: -1, active: false, store: null, navigate: null };

export function startTour(store, { navigate } = {}) {
  state.store = store;
  state.navigate = navigate || ((view) => { window.location.hash = `#/${view}`; });
  state.index = 0;
  state.active = true;
  document.addEventListener('keydown', onKey);
  paint();
}

export function stopTour() {
  state.active = false;
  document.removeEventListener('keydown', onKey);
  qs('#tourCard')?.remove();
}

export function isTourActive() { return state.active; }

function go(delta) {
  const next = state.index + delta;
  if (next < 0) return;
  if (next >= STOPS.length) { stopTour(); return; }
  state.index = next;
  paint();
}

function paint() {
  const stop = STOPS[state.index];
  state.navigate(stop.view);
  qs('#tourCard')?.remove();
  const card = h('div', { class: 'tour-card', id: 'tourCard', role: 'dialog', 'aria-live': 'polite' },
    h('div', { class: 'tour-head' },
      h('span', { class: 'tag', text: `Guided tour ${state.index + 1} / ${STOPS.length}` }),
      h('button', { class: 'icon-btn', title: 'End tour', 'aria-label': 'End tour', onclick: stopTour }, icon('close', { size: 15 }))
    ),
    h('h3', { text: stop.title }),
    h('p', { text: stop.body }),
    h('div', { class: 'tour-actions' },
      h('span', { class: 'fine', text: '← → to step · Esc to exit' }),
      h('button', { class: 'btn btn-ghost sm', disabled: state.index === 0, onclick: () => go(-1) }, 'Back'),
      h('button', { class: 'btn btn-primary sm', onclick: () => go(1) }, state.index === STOPS.length - 1 ? 'Finish' : 'Next')
    )
  );
  document.body.appendChild(card);
}

function onKey(e) {
  if (!state.active) return;
  if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  if (e.key === 'Escape') stopTour();
}
