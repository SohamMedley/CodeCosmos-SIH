/**
 * Code Cosmos · Match Workbench
 * The explainability surface: pick two records, see every point of the
 * confidence score, decide, and inspect the standardized output.
 * Includes a live console for arbitrary CPSE-style descriptions.
 */

import { h, clear, qs, fmtPct, fmtNum, toast, icon } from '../components/ui.js';
import { signalBars, tokenDiff, attributePills, bandChip, confidenceTone } from '../components/render.js';
import { buildRecord } from '../core/matcher.js';
import { recommend } from '../core/cnmc.js';

const GAUGE_CIRC = 2 * Math.PI * 66;

export function initWorkbench(store) {
  const selA = qs('#wbSelectA');
  const selB = qs('#wbSelectB');
  let current = null;

  store.on('complete', () => {
    fillSelectors();
    const { a, b } = store.selection;
    if (a) selA.value = a;
    if (b) selB.value = b;
    render();
  });

  selA.addEventListener('change', () => { store.selection.a = selA.value; render(); });
  selB.addEventListener('change', () => { store.selection.b = selB.value; render(); });
  qs('#wbSwap').addEventListener('click', () => {
    const a = selA.value; selA.value = selB.value; selB.value = a;
    store.selection.a = selA.value; store.selection.b = selB.value; render();
  });
  qs('#wbRandom').addEventListener('click', () => {
    if (store.pairs.length < 2) return;
    const p = store.pairs[Math.floor(Math.random() * Math.min(60, store.pairs.length))];
    selA.value = p.a.id; selB.value = p.b.id;
    store.selection.a = p.a.id; store.selection.b = p.b.id;
    render();
  });
  qs('#wbShowcase').addEventListener('click', () => {
    const bearing = store.records.filter((r) => r.conceptId === 'BRG-6205');
    if (bearing.length >= 2) {
      selA.value = bearing[0].id; selB.value = bearing[bearing.length - 1].id;
      store.selection.a = selA.value; store.selection.b = selB.value;
      render();
      toast('info', 'SIH example loaded', 'Comparing two descriptions of bearing 6205 from different CPSEs.');
    } else {
      toast('warn', 'Example unavailable', 'Regenerate the corpus with the SIH showcase enabled.');
    }
  });

  qs('#wbAccept').addEventListener('click', () => decide('accepted'));
  qs('#wbReject').addEventListener('click', () => decide('rejected'));
  qs('#wbReset').addEventListener('click', () => decide(null));

  function decide(verdict) {
    if (!current) return toast('warn', 'No pair selected');
    if (verdict === null) {
      store.pipeline.decisions.delete(current.key);
      store.decisions.delete(current.key);
      store.pipeline.rebuildClusters();
      store.pipeline.buildMasterItems();
      store.pipeline.metrics = store.pipeline.computeMetrics();
      const snap = store.pipeline.snapshot();
      store.applySnapshot(snap);
      store.emit('decision', { pairKey: current.key, verdict: null, snapshot: snap });
      render();
      return toast('info', 'Decision cleared', 'The pair returns to its AI-assigned band.');
    }
    store.decide(current.key, verdict);
    toast(verdict === 'accepted' ? 'ok' : 'warn',
      verdict === 'accepted' ? 'Match approved' : 'Match rejected',
      `Recorded against ${current.a.legacyCode || current.a.id} ↔ ${current.b.legacyCode || current.b.id}.`);
    render();
  }

  function fillSelectors() {
    const options = store.records.map((r) => h('option', { value: r.id, text: `${r.cpse} · ${r.legacyCode} · ${r.raw.slice(0, 64)}` }));
    clear(selA); clear(selB);
    options.forEach((o) => selA.append(o.cloneNode(true)));
    options.forEach((o) => selB.append(o.cloneNode(true)));
  }

  function render() {
    const a = store.recordById(selA.value);
    const b = store.recordById(selB.value);
    if (!a || !b) return;
    const pair = store.pairFor(a.id, b.id) || store.pipeline.index.score(a, b);
    current = pair;

    // ---- gauge ------------------------------------------------------------
    const g = qs('#wbGauge');
    g.style.strokeDasharray = String(GAUGE_CIRC);
    g.style.strokeDashoffset = String(GAUGE_CIRC * (1 - pair.confidence));
    qs('#wbConfidence').textContent = fmtPct(pair.confidence, 1);
    qs('#wbBand').textContent = pair.band.label;
    const tone = confidenceTone(pair.confidence);
    qs('#wbVerdict').dataset.tone = tone;

    // ---- signals ----------------------------------------------------------
    const penalty = pair.criticalConflicts ? [[`decisive conflict cap ×${(pair.matched.length ? 0.74 : 1).toFixed(2)}`, 0.74]]
      : (pair.conflicts.length ? [['soft conflict penalty', 0.94]] : []);
    const sigHost = qs('#wbSignals');
    clear(sigHost);
    sigHost.append(signalBars(pair.scores, { penalties: penalty }));

    // ---- panes ------------------------------------------------------------
    renderPane('#wbPaneA', a);
    renderPane('#wbPaneB', b);
    qs('#wbChipA').textContent = `${a.cpse} · ${a.family.label}`;
    qs('#wbChipB').textContent = `${b.cpse} · ${b.family.label}`;

    // ---- attribute table --------------------------------------------------
    const body = qs('#attrBody');
    clear(body);
    const seen = new Set();
    [...pair.matched, ...pair.conflicts].forEach((m) => {
      if (seen.has(m.key)) return;
      seen.add(m.key);
      body.append(h('tr', {},
        h('td', { text: m.label }),
        h('td', { class: 'mono small', text: (m.asWritten || m.detail).split(' vs ')[0] }),
        h('td', { class: 'mono small', text: (m.asWritten || m.detail).split(' vs ')[1] || '—' }),
        h('td', { class: 'mono small', text: m.detail }),
        h('td', {}, h('span', { class: `pill ${m.verdict === 'conflict' ? 'crit' : 'k'}`, text: m.verdict }))
      ));
    });
    (pair.missing || []).forEach((m) => {
      if (seen.has(m.key)) return;
      seen.add(m.key);
      const sa = a.specMap.get(m.key) || b.specMap.get(m.key);
      body.append(h('tr', {},
        h('td', { text: m.label }),
        h('td', { class: 'mono small', text: a.specMap.get(m.key) ? a.specMap.get(m.key).text : '—' }),
        h('td', { class: 'mono small', text: b.specMap.get(m.key) ? b.specMap.get(m.key).text : '—' }),
        h('td', { class: 'mono small muted', text: sa ? `${fmtNum(sa.baseValue, 2)} ${sa.baseUnit || ''}` : '—' }),
        h('td', {}, h('span', { class: 'pill', text: 'one-sided' }))
      ));
    });
    if (!body.children.length) {
      body.append(h('tr', {}, h('td', { colspan: '5' }, h('span', { class: 'muted small', text: 'Neither description carries structured technical attributes — the score rests on semantic and fuzzy text evidence only.' }))));
    }

    // ---- reasoning --------------------------------------------------------
    const reason = qs('#wbReason');
    clear(reason);
    pair.explanation.forEach((e) => {
      reason.append(h('li', { class: e.type },
        h('span', { class: 'r-ico' }, icon({ semantic: 'semantic', fuzzy: 'fuzzy', attribute: 'tag', match: 'check', conflict: 'alert' }[e.type] || 'info', { size: 14 })),
        h('div', {}, h('strong', { text: e.label }), h('p', { text: e.detail }))
      ));
    });
    const sharedHost = qs('#wbShared');
    clear(sharedHost);
    (pair.shared || []).forEach((f) => sharedHost.append(h('span', { class: `pill ${f.kind === 'concept' ? 'k' : ''}`, text: f.label })));

    // ---- standardized output ---------------------------------------------
    const out = qs('#wbOutput');
    clear(out);
    const master = store.masterForRecord(a.id) || store.masterForRecord(b.id);
    const recA = recommend(a, { confidence: pair.confidence });
    const recB = recommend(b, { confidence: pair.confidence });
    [['if record A is the master', recA], ['if record B is the master', recB]].forEach(([label, rec]) => {
      out.append(h('div', { class: 'out-cell' },
        h('span', { text: label }),
        h('strong', {}, h('code', { text: rec.code })),
        h('p', { class: 'small muted', text: rec.standardDescription }),
        h('div', { class: 'sc-chips' },
          h('span', { class: 'sc-chip c', text: rec.classLabel }),
          h('span', { class: 'sc-chip', text: `UOM ${rec.unit}` }),
          h('span', { class: 'sc-chip', text: `completeness ${fmtPct(rec.completeness, 0)}` }),
          rec.missingCritical.length ? h('span', { class: 'sc-chip', text: `missing: ${rec.missingCritical.join(', ')}` }) : null
        )));
    });
    out.append(h('div', { class: 'out-cell' },
      h('span', { text: 'decision outcome' }),
      h('strong', { text: pair.band.label }),
      h('p', { class: 'small muted', text: pair.band.action }),
      master ? h('p', { class: 'small', text: `Already in master as ${master.code}` }) : h('p', { class: 'small muted', text: 'Not yet in the master' }),
      h('div', { class: 'sc-chips' },
        h('span', { class: 'sc-chip c', text: `semantic ${fmtPct(pair.scores.semantic, 0)}` }),
        h('span', { class: 'sc-chip', text: `fuzzy ${fmtPct(pair.scores.fuzzy, 0)}` }),
        h('span', { class: 'sc-chip', text: `attributes ${pair.scores.attribute === null ? 'n/a' : fmtPct(pair.scores.attribute, 0)}` })
      )));
  }

  function renderPane(target, record) {
    const host = qs(target);
    clear(host);
    host.append(
      h('div', { class: 'raw-block' }, h('span', { class: 'lbl', text: `${record.cpse} · legacy code ${record.legacyCode}` }), record.raw),
      h('div', { class: 'raw-block' }, h('span', { class: 'lbl', text: 'normalized' }), record.normalized.text || '—'),
      h('div', { class: 'dr-block' }, h('h4', { text: 'token transformation' }), tokenDiff(record)),
      h('div', { class: 'dr-block' }, h('h4', { text: `technical attributes (${record.specs.length})` }), attributePills(record, 18)),
      h('div', { class: 'sc-chips' },
        h('span', { class: 'sc-chip c', text: record.family.label }),
        h('span', { class: 'sc-chip', text: record.type }),
        record.normalized.brand ? h('span', { class: 'sc-chip', text: `vendor: ${record.normalized.brand}` }) : null)
    );
  }

  /* ---------------------------- live console ---------------------------- */
  const pgInput = qs('#pgInput');
  const demos = [
    'BALL BEARING, 6205',
    'SKF 6205 BEARING',
    'BRG. DEEP GROOVE BALL 6206 ZZ (MAKE : SKF) - NOS',
    '2 INCH GATE VALVE CI FLANGED PN16',
    'M10 X 50 HEX BOLT SS 304 GR 8.8',
    'ALUMINIUM CABLE 3C X 2.5 SQMM 1.1 KV'
  ];
  const demoHost = qs('#pgDemo');
  demos.forEach((d) => demoHost.append(h('button', { text: d, onclick: () => { pgInput.value = d; analyse(); } })));
  qs('#pgRun').addEventListener('click', analyse);
  pgInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') analyse(); });

  function analyse() {
    if (!store.records.length) return toast('warn', 'Run the pipeline first');
    const raw = pgInput.value.trim();
    if (!raw) return;
    const probe = buildRecord('probe', raw, { cpse: 'YOU', unit: '—', legacyCode: 'INPUT' });
    const results = store.pipeline.index.query(probe, 6);
    const rec = recommend(probe, { confidence: results[0] ? results[0].confidence : null });

    const out = qs('#pgOut');
    clear(out);
    out.append(
      h('div', { class: 'panel-inner rule-block' },
        h('span', { text: 'stage 1 · normalization' }),
        h('code', { text: probe.normalized.text || '—' }),
        tokenDiff(probe),
        h('span', { text: `rules fired: ${probe.normalized.rules.join(', ') || 'none'}` }),
        h('span', { text: `vendor neutralised: ${probe.normalized.brand || 'none'}` })
      ),
      h('div', { class: 'panel-inner rule-block' },
        h('span', { text: `stage 2/3 · attributes & units (${probe.specs.length})` }),
        attributePills(probe, 18),
        h('span', { text: `family: ${probe.family.label} · type: ${probe.type}` })
      ),
      h('div', { class: 'panel-inner rule-block' },
        h('span', { text: 'stage 9 · recommended CNMC mapping' }),
        h('code', { text: rec.code }),
        h('span', { text: rec.standardDescription }),
        h('span', { text: `class ${rec.classLabel} · UOM ${rec.unit} · completeness ${fmtPct(rec.completeness, 0)}` })
      ),
      h('div', { class: 'panel-inner rule-block' },
        h('span', { text: 'stage 5-8 · closest validated material records' }),
        results.length ? h('ul', { class: 'queue' }, results.map((r) => h('li', {},
          h('div', { class: 'q-top' },
            h('span', { class: 'q-conf', text: fmtPct(r.confidence, 1) }),
            bandChip(r.band)),
          h('span', { class: 'q-desc', text: `${r.other.cpse} · ${r.other.raw}` }),
          h('div', { class: 'q-tags' },
            h('span', { class: 'pill k', text: `sem ${fmtPct(r.scores.semantic, 0)}` }),
            h('span', { class: 'pill', text: `fz ${fmtPct(r.scores.fuzzy, 0)}` }),
            r.scores.attribute === null ? null : h('span', { class: 'pill', text: `attr ${fmtPct(r.scores.attribute, 0)}` }),
            r.criticalConflicts ? h('span', { class: 'pill crit', text: `${r.criticalConflicts} decisive conflict(s)` }) : null)
        ))) : h('span', { class: 'muted', text: 'No candidate above the blocking threshold.' })
      )
    );
  }
}
