/**
 * Code Cosmos · Pipeline view
 * Live stage timeline, throughput chart, audit trail and the
 * normalization showcase for the SIH example descriptions.
 */

import { h, clear, qs, fmtInt, fmtTime, fmtPct, icon } from '../components/ui.js';
import { STAGES } from '../core/pipeline.js';
import { barChart } from '../viz/charts.js';
import { tokenDiff, attributePills } from '../components/render.js';

export function initPipeline(store) {
  buildTimeline();
  qs('#pipelineRun').addEventListener('click', () => store.run());

  const chart = qs('#chartStages');
  chart.dataset.height = '260';

  let lastAudit = 0;
  store.on('progress', (p) => renderProgress(p));
  store.on('audit', (entry) => appendAudit(entry, store));
  store.on('complete', (snap) => {
    renderProgress({ pct: 100, stages: Object.fromEntries(STAGES.map((s) => [s.id, 100])), stage: null, detail: 'Pipeline complete' });
    renderChart(snap);
    renderShowcase(store);
  });
  store.on('records', () => { /* keep DOM light until completion */ });

  function renderChart(snap) {
    const stages = STAGES.map((s) => ({
      label: `${s.index}. ${s.short}`,
      value: 100,
      color: null
    }));
    barChart(chart, { items: stages, horizontal: true });
    chart.dataset.height = '';
    void snap;
  }

  function appendAudit(entry, st) {
    if (!entry || lastAudit === 0 && entry.id === 'A1') clear(qs('#auditLog'));
    lastAudit = 1;
    const list = qs('#auditLog');
    list.prepend(h('li', { class: entry.tone },
      h('time', { text: fmtTime(entry.at) }),
      h('div', {}, h('strong', { text: entry.action }), h('p', { text: entry.detail }))
    ));
    while (list.children.length > 40) list.lastChild.remove();
    void st;
  }
}

function buildTimeline() {
  const host = qs('#stageTimeline');
  clear(host);
  STAGES.forEach((s) => {
    host.append(h('article', { class: 'stage', id: `stage-${s.id}`, dataset: { stage: s.id } },
      h('div', { class: 'stage-idx', dataset: { icon: s.icon } },
        icon(s.icon, { size: 17, cls: 'ico stage-ico' }),
        h('b', { text: String(s.index) })),
      h('div', { class: 'stage-body' },
        h('h3', { text: s.label }),
        h('p', { text: s.detail })
      ),
      h('div', { class: 'stage-meta' },
        h('span', { class: 'pct', text: '0%' }),
        h('span', { class: 'stat', text: 'pending' })
      ),
      h('i', { class: 'stage-prog' })
    ));
  });
}

function renderProgress(p) {
  STAGES.forEach((s) => {
    const el = qs(`#stage-${s.id}`);
    if (!el) return;
    const pct = Math.round(p.stages && p.stages[s.id] ? p.stages[s.id] : 0);
    el.classList.toggle('done', pct >= 100);
    el.classList.toggle('active', p.stage === s.id && pct < 100);
    el.querySelector('.pct').textContent = `${pct}%`;
    el.querySelector('.stat').textContent = pct >= 100 ? 'complete' : p.stage === s.id ? 'running' : 'pending';
    el.querySelector('.stage-prog').style.width = `${pct}%`;
  });
}

function renderShowcase(store) {
  const host = qs('#showcaseGrid');
  clear(host);
  const groups = new Map();
  store.records.forEach((r) => {
    if (r.source !== 'showcase') return;
    if (!groups.has(r.conceptId)) groups.set(r.conceptId, []);
    groups.get(r.conceptId).push(r);
  });
  groups.forEach((records, conceptId) => {
    const master = store.masterForRecord(records[0].id);
    host.append(h('article', { class: 'showcase-card' },
      h('div', { class: 'sc-chips' },
        h('span', { class: 'sc-chip c', text: conceptId }),
        h('span', { class: 'sc-chip', text: `${records.length} descriptions` })
      ),
      ...records.map((r, i) => h('div', {},
        h('div', { class: 'sc-raw', text: `${r.cpse} · ${r.raw}` }),
        i < records.length - 1 ? h('div', { class: 'sc-arrow' }, icon('arrowDown', { size: 15 })) : null
      )),
      h('div', { class: 'sc-arrow flow-note' }, icon('arrowDown', { size: 15 }), h('span', { text: 'harmonized' })),
      h('div', { class: 'sc-std' }, h('code', { class: 'mono', text: master ? master.code : 'CNMC —' })),
      h('div', { class: 'small muted', text: master ? master.standardDescription : 'standard description generated from validated attributes' }),
      h('div', { class: 'dr-block' }, h('h4', { text: 'extracted attributes' }), attributePills(records[0], 10)),
      h('div', { class: 'dr-block' }, h('h4', { text: 'normalization of the most complex variant' }),
        tokenDiff(records.slice().sort((a, b) => b.normalized.segments.length - a.normalized.segments.length)[0])),
      master ? h('div', { class: 'small muted', text: `cohesion ${fmtPct(master.cohesion, 0)} · ${fmtInt(master.duplicatesRemoved)} duplicate row(s) collapsed · ${master.cpseSpread} CPSE(s)` }) : null
    ));
  });
  if (!groups.size) {
    host.append(h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, icon('flow', { size: 30 })), h('p', { text: 'Run the pipeline to see the showcase.' })));
  }
}
