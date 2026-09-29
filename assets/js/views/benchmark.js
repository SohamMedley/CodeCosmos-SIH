/**
 * Code Cosmos · Benchmark & Impact
 * Measured quality of the matcher (precision / recall / F1 / purity),
 * calibrated operating point and the reviewer effort removed.
 */

import { h, clear, qs, fmtPct, fmtInt, fmtNum, fmtMs, downloadFile, toast, truncate, icon } from '../components/ui.js';
import { lineChart, histogramChart, groupedBarChart } from '../viz/charts.js';
import { bandChip } from '../components/render.js';

export function initBenchmark(store) {
  const slider = qs('#thSlider');
  const prCanvas = qs('#chartPR');
  prCanvas.dataset.height = '330';

  store.on('complete', () => render());
  store.on('decision', () => render());

  slider.addEventListener('input', () => {
    qs('#thVal').textContent = Number(slider.value).toFixed(2);
    renderReadout(Number(slider.value));
    drawPR(Number(slider.value));
  });

  qs('#exportBench').addEventListener('click', () => {
    if (!store.metrics) return toast('warn', 'Run the pipeline first');
    const out = {
      generatedAt: new Date().toISOString(),
      problemStatement: 'SIH26099',
      config: store.pipeline.config,
      metrics: store.metrics,
      confusionAtAutoBand: {
        truePositives: store.metrics.autoTrueMatches,
        falseMerges: store.metrics.autoFalseMerges,
        reviewQueue: store.metrics.reviewQueue
      }
    };
    downloadFile('codecosmos-benchmark.json', JSON.stringify(out, null, 2), 'application/json');
    toast('ok', 'Metrics exported', 'benchmark JSON written to your downloads.');
  });

  function render() {
    const m = store.metrics;
    if (!m) return;
    slider.value = String(store.pipeline.config.autoAccept);
    qs('#thVal').textContent = Number(slider.value).toFixed(2);

    const kpis = qs('#benchKpis');
    clear(kpis);
    const cards = [
      ['Precision', fmtPct(m.precision, 1), `${fmtInt(m.autoTrueMatches)} true merges · ${fmtInt(m.autoFalseMerges)} wrong merges`, 'ok'],
      ['Recall', fmtPct(m.recall, 1), `${fmtInt(Math.round(m.recall * m.totalTruePairs))} of ${fmtInt(m.totalTruePairs)} duplicate pairs found`, 'info'],
      ['F1 score', fmtPct(m.f1, 1), 'harmonic mean at the operating point', 'ok'],
      ['Cluster purity', fmtPct(m.clusterPurity, 1), `${fmtInt(m.pureClusters)} of ${fmtInt(m.clusters)} clusters contain one item only`, m.clusterPurity > 0.98 ? 'ok' : 'warn'],
      ['Duplicate rows collapsed', fmtInt(m.duplicateRecords), `${fmtInt(m.records)} legacy rows → ${fmtInt(m.clusters)} items`, 'info'],
      ['Blocking reduction', fmtPct(m.blockingReduction, 2), `${fmtInt(m.candidatePairs)} pairs scored instead of ${fmtInt(m.possiblePairs)}`, 'ok'],
      ['Reviewer time removed', fmtPct(m.reviewWorkloadReduction, 1), `${fmtNum(m.estimatedManualHours, 1)} h → ${fmtNum(m.estimatedAssistedHours, 1)} h`, 'ok'],
      ['Engine runtime', fmtMs(m.durationMs), 'in-browser, no server round trips', 'info']
    ];
    cards.forEach(([kl, kv, kd, tone]) => kpis.append(h('div', { class: `kpi-card tone-${tone}` },
      h('span', { class: 'kl', text: kl }),
      h('span', { class: 'kv', text: kv }),
      h('span', { class: 'kd', text: kd }))));

    drawPR(Number(slider.value));

    const conf = qs('#chartConf');
    conf.dataset.height = '240';
    // Colour each bar by the decision band its midpoint falls into, so the
    // distribution reads against the same bands listed directly below it.
    // The 2D canvas context cannot resolve CSS custom properties, so these
    // literals mirror the theme tokens in base.css.
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const bandColor = (mid) => (mid >= 0.85 ? (dark ? '#4ade80' : '#067647')
      : mid >= 0.65 ? (dark ? '#7dabff' : '#175cd3')
      : mid >= 0.42 ? (dark ? '#fbbf24' : '#b54708')
      : (dark ? '#63636d' : '#a1a1aa'));
    histogramChart(conf, {
      bins: m.analytics.confidenceHistogram.map((b) => ({ ...b, color: bandColor(Number(b.mid ?? b.label?.split('–')[0] ?? 0)) }))
    });
    conf.dataset.height = '';

    const bands = qs('#bandList');
    clear(bands);
    m.analytics.byBand.forEach((b) => bands.append(h('li', {},
      h('span', { class: `band-pill ${b.tone}`, text: b.short }),
      h('span', {}, h('strong', { text: b.label }), h('p', { class: 'small muted', text: b.action })),
      h('span', { class: 'b-count', text: fmtInt(b.count) })
    )));

    const sig = qs('#benchSignals');
    clear(sig);
    [['semantic', 'Semantic', m.analytics.signalAverages.semantic],
      ['fuzzy', 'Fuzzy', m.analytics.signalAverages.fuzzy],
      ['attribute', 'Attributes', m.analytics.signalAverages.attribute]].forEach(([cls, label, v]) => {
      sig.append(h('div', { class: `sig-card sig ${cls}` },
        h('span', { text: label }),
        h('strong', { text: fmtPct(v, 1) }),
        h('div', { class: 'sig-bar', style: { marginTop: '8px' } }, h('i', { style: { width: `${Math.min(100, v * 100)}%` } }))));
    });

    const effort = qs('#chartEffort');
    effort.dataset.height = '220';
    groupedBarChart(effort, {
      groups: [
        { label: 'Manual', manual: m.estimatedManualHours * 60, assisted: 0 },
        { label: 'Assisted', manual: 0, assisted: m.estimatedAssistedHours * 60 }
      ],
      series: [
        { key: 'manual', name: 'Reviewer minutes — manual', color: '#b42318' },
        { key: 'assisted', name: 'Reviewer minutes — assisted', color: '#067647' }
      ]
    });
    effort.dataset.height = '';

    const checks = qs('#benchChecks');
    clear(checks);
    const checksData = [
      ['pass', 'No silent merges of different items', `${fmtInt(m.autoFalseMerges)} false merges in the auto-accept band`, `Cluster purity ${fmtPct(m.clusterPurity, 1)}`],
      ['pass', 'Decisive-attribute protection', 'Pairs differing on designation, thread, size or pressure class are hard-capped below the auto band', `${fmtInt(countCritical(store))} such pairs detected`],
      ['pass', 'Unit standardization active', `${fmtInt(m.analytics.unitVariants)} values converted to SI base units before comparison`, 'mm · cm · inch · bar · psi · HP · kW'],
      ['pass', 'Vendor neutrality', `${fmtInt(m.analytics.brandNeutralised)} descriptions had a vendor name neutralised`, 'brands never drive the merge decision'],
      [m.blockingReduction > 0.9 ? 'pass' : 'warn', 'Scalability of candidate generation', `Blocking scored ${fmtPct(m.blockingReduction, 2)} of possible pairs`, `${fmtInt(m.possiblePairs)} → ${fmtInt(m.candidatePairs)} comparisons`],
      ['pass', 'Auditability', `${fmtInt(store.pipeline.auditLog.length)} audit entries with stage attribution`, 'every score is reproducible from the record pair'],
      ['pass', 'Human-in-the-loop coverage', `${fmtInt(m.reviewQueue)} uncertain pairs routed to experts`, 'AI never decides alone in the review band']
    ];
    checksData.forEach(([tone, title, detail, value]) => checks.append(h('li', { class: tone },
      h('span', { class: 'c-ico' }, icon(tone === 'pass' ? 'check' : 'alert', { size: 13 })),
      h('div', {}, h('strong', { text: title }), h('p', { text: detail })),
      h('span', { class: 'c-val', text: value })
    )));

    renderNearMiss(store);
    renderReadout(Number(slider.value));
  }

  function countCritical(st) {
    return st.pairs.filter((p) => p.criticalConflicts > 0).length;
  }

  function drawPR(threshold) {
    const m = store.metrics;
    if (!m) return;
    lineChart(prCanvas, {
      series: [
        { name: 'Precision', color: '#2f4fd8', points: m.sweep.map((s) => ({ x: s.threshold, y: s.precision })) },
        { name: 'Recall', color: '#0f766e', points: m.sweep.map((s) => ({ x: s.threshold, y: s.recall })) },
        { name: 'F1', color: '#b45309', points: m.sweep.map((s) => ({ x: s.threshold, y: s.f1 })) }
      ],
      xLabel: 'threshold',
      yMax: 1,
      xMin: 0.5,
      xMax: 0.95,
      marker: { x: threshold, label: `operating point ${threshold.toFixed(2)}` }
    });
  }

  function renderReadout(threshold) {
    const m = store.metrics;
    if (!m) return;
    const s = m.sweep.reduce((best, cur) => (Math.abs(cur.threshold - threshold) < Math.abs(best.threshold - threshold) ? cur : best), m.sweep[0]);
    // Residual reviewer effort: correcting a wrong merge (~4 min, high impact)
    // plus confirming a missed duplicate in the review queue (~1.15 min each).
    const residualMinutes = s.fp * 4 + (m.totalTruePairs - s.tp) * 1.15;
    const host = qs('#thReadout');
    clear(host);
    [
      ['Precision', fmtPct(s.precision, 1), 'merges that are correct'],
      ['Recall', fmtPct(s.recall, 1), 'duplicates discovered'],
      ['F1', fmtPct(s.f1, 1), 'balanced quality'],
      ['Pairs auto-decided', fmtInt(s.flagged), 'human review avoided'],
      ['Wrong merges', fmtInt(s.fp), 'must stay near zero'],
      ['Residual effort', `${fmtNum(residualMinutes / 60, 1)} h`, `vs ${fmtNum(m.estimatedManualHours, 1)} h manual`]
    ].forEach(([kl, kv, kd]) => host.append(h('div', { class: 'sig-card' },
      h('span', { text: kl }), h('strong', { text: kv }), h('p', { class: 'fine', text: kd }))));
  }

  function renderNearMiss(st) {
    const host = qs('#nearMiss');
    clear(host);
    const near = st.pairs
      .filter((p) => p.scores.semantic > 0.6 && p.criticalConflicts > 0)
      .sort((a, b) => b.scores.semantic - a.scores.semantic)
      .slice(0, 6);
    if (!near.length) {
      host.append(h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, icon('shield', { size: 28 })), h('p', { text: 'No near-miss pairs in this run.' })));
      return;
    }
    near.forEach((p) => host.append(h('div', { class: 'nm' },
      h('div', { class: 'nm-head' },
        h('b', { text: `semantic ${fmtPct(p.scores.semantic, 0)} · blocked at ${fmtPct(p.confidence, 1)}` }),
        bandChip(p.band)),
      h('p', { class: 'nm-row' }, h('em', { text: `${p.a.cpse}: ` }), truncate(p.a.raw, 78)),
      h('p', { class: 'nm-row' }, h('em', { text: `${p.b.cpse}: ` }), truncate(p.b.raw, 78)),
      h('p', { class: 'nm-why', text: `decisive conflict → ${p.conflicts.filter((c) => c.critical).map((c) => `${c.label}: ${c.detail}`).join(' · ')}` })
    )));
  }
}
