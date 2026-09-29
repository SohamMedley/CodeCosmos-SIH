/**
 * Code Cosmos · Data Explorer
 * Semantic embedding space, corpus composition, searchable record table.
 */

import { h, clear, qs, fmtInt, debounce, renderPager, downloadFile, toCsv, truncate, toast, openDrawer, kv, fmtDate } from '../components/ui.js';
import { scatterChart, barChart, palette } from '../viz/charts.js';
import { attributeTable, attributePills, bandChip, tokenDiff } from '../components/render.js';

const PAGE_SIZE = 25;

export function initExplorer(store) {
  let page = 1;
  let filterCpse = 'ALL';
  let query = '';

  const space = qs('#chartSpace');
  const cpseSel = qs('#explorerCpse');
  const search = qs('#recordSearch');

  store.on('complete', () => {
    buildCpseFilter();
    drawSpace();
    drawComposition();
    renderTable();
  });

  cpseSel.addEventListener('change', () => { filterCpse = cpseSel.value; page = 1; renderTable(); });
  search.addEventListener('input', debounce(() => { query = search.value.trim().toLowerCase(); page = 1; renderTable(); }, 180));
  qs('#exportRows').addEventListener('click', () => {
    if (!store.records.length) return toast('warn', 'Nothing to export', 'Run the pipeline first.');
    const rows = filtered().map((r) => ({
      legacy_code: r.legacyCode, description: r.raw, normalized: r.normalized.text, cpse: r.cpse,
      unit: r.unit, family: r.family.label, type: r.type, attributes: r.specs.length,
      attribute_detail: r.specs.map((s) => `${s.key}=${s.text}`).join(' | '),
      master_item: (store.masterForRecord(r.id) || {}).code || '',
      criticality: r.criticality
    }));
    downloadFile('codecosmos-legacy-records.csv', toCsv(rows), 'text/csv');
    toast('ok', 'CSV exported', `${rows.length} legacy records written.`);
  });

  function filtered() {
    let rows = store.records;
    if (filterCpse !== 'ALL') rows = rows.filter((r) => r.cpse === filterCpse);
    if (query) {
      rows = rows.filter((r) => `${r.raw} ${r.normalized.text} ${r.legacyCode} ${r.cpse} ${r.family.label} ${r.type}`.toLowerCase().includes(query));
    }
    return rows;
  }

  function buildCpseFilter() {
    const all = [...new Set(store.records.map((r) => r.cpse))].sort();
    clear(cpseSel);
    cpseSel.append(h('option', { value: 'ALL', text: `All CPSEs (${all.length})` }));
    all.forEach((c) => cpseSel.append(h('option', { value: c, text: c })));
  }

  function drawSpace() {
    if (!store.points2d) return;
    space.dataset.height = '330';
    const familyColors = new Map();
    const points = store.records.map((r, i) => {
      const pt = store.points2d[i] || { x: 0, y: 0 };
      const key = r.family.id;
      if (!familyColors.has(key)) familyColors.set(key, palette(familyColors.size));
      const best = store.bestBandForRecord(r.id);
      return {
        x: pt.x, y: pt.y, color: familyColors.get(key),
        r: 3 + Math.min(3.4, r.specs.length * 0.4),
        highlight: best && best.confidence >= 0.85,
        label: `${r.cpse} · ${truncate(r.raw, 70)}`,
        group: `${r.family.label} · ${r.specs.length} attributes · best match ${best ? (best.confidence * 100).toFixed(0) : '—'}%`,
        record: r
      };
    });
    scatterChart(space, { points, onClick: (pt) => pt.record && openRecord(pt.record) });

    const legend = qs('#spaceLegend');
    clear(legend);
    [...familyColors.entries()].forEach(([id, color]) => {
      const fam = store.records.find((r) => r.family.id === id);
      legend.append(h('span', {}, h('i', { style: { background: color } }), fam ? fam.family.label : id));
    });
    legend.append(h('span', {}, h('i', { style: { background: '#fff' } }), 'white ring = accepted into auto-band'));
  }

  function drawComposition() {
    const cpse = new Map();
    store.records.forEach((r) => cpse.set(r.cpse, (cpse.get(r.cpse) || 0) + 1));
    barChart(qs('#chartCpse'), {
      items: [...cpse.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })),
      horizontal: true, unit: 'rows'
    });
    const fam = new Map();
    store.records.forEach((r) => fam.set(r.family.label, (fam.get(r.family.label) || 0) + 1));
    const host = qs('#chartFamilies');
    host.dataset.height = '240';
    barChart(host, {
      items: [...fam.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([label, value]) => ({ label, value })),
      horizontal: true, unit: 'rows'
    });
    host.dataset.height = '';
  }

  function renderTable() {
    const rows = filtered();
    const body = qs('#recordBody');
    clear(body);
    const slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    slice.forEach((r) => {
      const master = store.masterForRecord(r.id);
      const best = store.bestBandForRecord(r.id);
      const tr = h('tr', { onclick: () => openRecord(r) },
        h('td', {}, h('span', { class: 'mono small', text: r.legacyCode || r.id })),
        h('td', { class: 'cell-raw' }, h('span', { text: truncate(r.raw, 92) })),
        h('td', {}, h('span', { class: 'chip small', text: r.cpse })),
        h('td', {}, h('span', { class: 'pill', text: r.family.label })),
        h('td', {}, h('span', { class: 'mono small muted', text: `${r.specs.length}` })),
        h('td', { class: 'mono small' }, master ? h('code', { class: 'mono small', style: { color: 'var(--cyan)' }, text: master.code }) : h('span', { class: 'muted', text: '—' })),
        h('td', {}, best ? bandChip(best.band) : h('span', { class: 'muted small', text: 'distinct' }))
      );
      body.append(tr);
    });
    if (!slice.length) {
      body.append(h('tr', {}, h('td', { colspan: '7' }, h('div', { class: 'empty-state' }, h('p', { text: 'No records match this filter.' })))));
    }
    qs('#recordCount').textContent = `${fmtInt(rows.length)} of ${fmtInt(store.records.length)} rows`;
    renderPager(qs('#recordPager'), { total: rows.length, page, pageSize: PAGE_SIZE, onPage: (p) => { page = p; renderTable(); } });
  }

  function openRecord(record) {
    openDrawer(`Record ${record.legacyCode || record.id}`, () => {
      const best = store.bestBandForRecord(record.id);
      const cluster = store.clusterForRecord(record.id);
      const master = store.masterForRecord(record.id);
      return [
        h('div', { class: 'dr-block' }, h('h4', { text: 'description as stored' }), h('div', { class: 'raw-block' }, record.raw)),
        h('div', { class: 'dr-block' }, h('h4', { text: 'normalized text' }), h('div', { class: 'raw-block' }, record.normalized.text || '—')),
        h('div', { class: 'dr-block' }, h('h4', { text: 'token transformation' }), tokenDiff(record)),
        h('div', { class: 'dr-block' }, h('h4', { text: 'record metadata' }), kv([
          ['CPSE', record.cpse],
          ['Plant / unit', record.unit],
          ['Legacy code', record.legacyCode],
          ['Criticality', record.criticality],
          ['First added', fmtDate(record.addedOn)],
          ['Family', record.family.label],
          ['Detected type', record.type],
          ['Vendor detected', record.normalized.brand || 'none'],
          ['Part no. removed', record.normalized.partNo || 'none'],
          ['Normalization rules fired', record.normalized.rules.join(', ') || 'none']
        ])),
        h('div', { class: 'dr-block' }, h('h4', { text: `technical attributes (${record.specs.length})` }), attributePills(record, 24)),
        h('div', { class: 'dr-block' }, h('h4', { text: 'attribute detail' }), attributeTable(record)),
        best ? h('div', { class: 'dr-block' }, h('h4', { text: 'strongest candidate match' }),
          h('div', { class: 'out-cell' },
            h('span', { text: `${best.confidence >= 0.85 ? 'auto-accepted' : 'review'} · ${(best.confidence * 100).toFixed(1)}%` }),
            h('p', { class: 'mono small', text: best.a.id === record.id ? best.b.raw : best.a.raw }),
            h('div', { class: 'sc-chips' }, bandChip(best.band)))) : null,
        cluster ? h('div', { class: 'dr-block' }, h('h4', { text: `duplicate cluster (${cluster.memberIds.length} rows, cohesion ${(cluster.cohesion * 100).toFixed(0)}%)` }),
          h('ul', { class: 'queue' }, cluster.members.map((m) => h('li', { onclick: () => openRecord(m) },
            h('span', { class: 'mono small', text: `${m.cpse} · ${m.legacyCode}` }),
            h('span', { class: 'q-desc', text: m.raw }))))) : null,
        master ? h('div', { class: 'dr-block' }, h('h4', { text: 'harmonized master item' }),
          h('div', { class: 'out-cell' }, h('span', { text: 'CNMC mapping' }), h('strong', {}, h('code', { text: master.code })),
            h('p', { class: 'small muted', text: master.standardDescription }))) : null
      ];
    });
  }
}
