/**
 * Code Cosmos · Standardized Material Master
 * One validated item per cluster, CNMC-mapped, exportable.
 */

import { h, clear, qs, fmtInt, fmtPct, debounce, renderPager, downloadFile, toCsv, toast, openDrawer, kv, fmtDate, icon } from '../components/ui.js';
import { barChart, palette } from '../viz/charts.js';
import { attributePills, attributeTable } from '../components/render.js';
import { CNMC_CLASSES } from '../core/cnmc.js';

const PAGE_SIZE = 20;

export function initMaster(store) {
  let page = 1;
  let query = '';

  store.on('complete', () => render());
  store.on('decision', () => render());

  qs('#masterSearch').addEventListener('input', debounce(() => {
    query = qs('#masterSearch').value.trim().toLowerCase();
    page = 1;
    render();
  }, 180));

  qs('#exportMasterCsv').addEventListener('click', () => {
    if (!store.masterItems.length) return toast('warn', 'Run the pipeline first');
    const rows = store.masterItems.map((m) => ({
      item_id: m.id,
      cnmc_code: m.code,
      cnmc_class: m.classCode,
      class_label: m.classLabel,
      standard_description: m.standardDescription,
      uom: m.unit,
      merged_records: m.memberIds.length,
      cpses: [...new Set(m.members.map((x) => x.cpse))].join(' | '),
      legacy_codes: m.legacyCodes.join(' | '),
      cohesion: m.cohesion.toFixed(3),
      completeness: m.completeness.toFixed(2),
      missing_critical: m.missingCritical.join(' | ')
    }));
    downloadFile('codecosmos-material-master.csv', toCsv(rows), 'text/csv');
    toast('ok', 'Master exported', `${rows.length} harmonized items written.`);
  });

  qs('#exportMasterJson').addEventListener('click', () => {
    if (!store.masterItems.length) return toast('warn', 'Run the pipeline first');
    const payload = {
      generatedAt: new Date().toISOString(),
      problemStatement: 'SIH26099',
      team: 'Code Cosmos',
      note: 'CNMC class codes and generated material codes are illustrative prototype mappings and must be validated against the official CNMC taxonomy.',
      items: store.masterItems.map((m) => ({
        itemId: m.id,
        cnmcCode: m.code,
        cnmcClass: m.classCode,
        classLabel: m.classLabel,
        type: m.type,
        family: m.family.label,
        standardDescription: m.standardDescription,
        unit: m.unit,
        cohesion: Number(m.cohesion.toFixed(4)),
        completeness: Number(m.completeness.toFixed(3)),
        duplicatesRemoved: m.duplicatesRemoved,
        cpseSpread: m.cpseSpread,
        missingCritical: m.missingCritical,
        sourceRecords: m.members.map((r) => ({ legacyCode: r.legacyCode, cpse: r.cpse, raw: r.raw, normalized: r.normalized.text }))
      }))
    };
    downloadFile('codecosmos-material-master.json', JSON.stringify(payload, null, 2), 'application/json');
    toast('ok', 'Master exported', 'JSON with full source traceability.');
  });

  function filtered() {
    if (!query) return store.masterItems;
    return store.masterItems.filter((m) => `${m.code} ${m.standardDescription} ${m.classLabel} ${m.type} ${m.legacyCodes.join(' ')}`.toLowerCase().includes(query));
  }

  function render() {
    if (!store.masterItems.length) return;
    const items = filtered();

    const stats = qs('#masterStats');
    clear(stats);
    const coveredClasses = new Set(store.masterItems.map((m) => m.classCode));
    const cpseCovered = new Set(store.records.map((r) => r.cpse));
    const avgCohesion = store.masterItems.reduce((s, m) => s + m.cohesion, 0) / store.masterItems.length;
    const incomplete = store.masterItems.filter((m) => m.missingCritical.length).length;
    [
      ['Master items', fmtInt(store.masterItems.length), 'validated engineering items'],
      ['Merged legacy rows', fmtInt(store.masterItems.reduce((s, m) => s + m.memberIds.length, 0)), `across ${fmtInt(cpseCovered.size)} CPSEs`],
      ['CNMC classes mapped', `${fmtInt(coveredClasses.size)} / ${fmtInt(CNMC_CLASSES.filter((c) => c.family !== 'unclassified').length)}`, 'taxonomy coverage'],
      ['Mean cluster cohesion', fmtPct(avgCohesion, 1), `${fmtInt(incomplete)} item(s) flagged for data completion`]
    ].forEach(([kl, kv, kd]) => stats.append(h('div', { class: 'kpi-card' },
      h('span', { class: 'kl', text: kl }), h('span', { class: 'kv', text: kv }), h('span', { class: 'kd', text: kd }))));

    const body = qs('#masterBody');
    clear(body);
    const slice = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    slice.forEach((m) => body.append(h('tr', { onclick: () => openItem(m) },
      h('td', {}, h('code', { class: 'mono small', style: { color: 'var(--accent)' }, text: m.code })),
      h('td', { class: 'cell-raw' }, h('span', { text: m.standardDescription })),
      h('td', {}, h('span', { class: 'pill', text: m.classLabel })),
      h('td', {}, h('span', { class: 'mono small', text: m.unit })),
      h('td', {}, h('span', { class: 'mono small', text: fmtInt(m.memberIds.length) })),
      h('td', {}, h('span', { class: 'mono small', text: fmtInt(m.cpseSpread) })),
      h('td', {}, h('span', { class: 'mono small', text: fmtPct(m.cohesion, 0) })),
      h('td', {}, h('span', { class: `pill ${m.completeness > 0.6 ? 'k' : 'crit'}`, text: fmtPct(m.completeness, 0) }))
    )));
    if (!slice.length) body.append(h('tr', {}, h('td', { colspan: '8' }, h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, icon('search', { size: 28 })), h('p', { text: 'No master items match this search.' })))));
    qs('#masterCount').textContent = `${fmtInt(items.length)} of ${fmtInt(store.masterItems.length)} items`;
    renderPager(qs('#masterPager'), { total: items.length, page, pageSize: PAGE_SIZE, onPage: (p) => { page = p; render(); } });

    const byClass = new Map();
    store.masterItems.forEach((m) => byClass.set(m.classLabel, (byClass.get(m.classLabel) || 0) + m.memberIds.length));
    const chart = qs('#chartCnmc');
    chart.dataset.height = '280';
    barChart(chart, {
      items: [...byClass.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })),
      horizontal: true, unit: 'records'
    });
  }

  function openItem(m) {
    openDrawer(m.code, () => [
      h('div', { class: 'dr-block' }, h('h4', { text: 'standard description' }), h('div', { class: 'raw-block' }, m.standardDescription)),
      h('div', { class: 'dr-block' }, h('h4', { text: 'mapping' }), kv([
        ['Item id', m.id],
        ['CNMC code', m.code],
        ['CNMC class', `${m.classCode} — ${m.classLabel}`],
        ['Engineering type', m.type],
        ['Family', m.family.label],
        ['Unit of measure', m.unit],
        ['Cluster cohesion', fmtPct(m.cohesion, 1)],
        ['Attribute completeness', fmtPct(m.completeness, 0)],
        ['Missing decisive fields', m.missingCritical.join(', ') || 'none'],
        ['Merged records', String(m.memberIds.length)],
        ['CPSE spread', String(m.cpseSpread)]
      ])),
      h('div', { class: 'dr-block' }, h('h4', { text: 'master record attributes' }), attributePills(m.masterRecord, 22)),
      h('div', { class: 'dr-block' }, h('h4', { text: 'attribute detail' }), attributeTable(m.masterRecord)),
      h('div', { class: 'dr-block' }, h('h4', { text: `source legacy records (${m.members.length})` }),
        h('ul', { class: 'queue' }, m.members.map((r) => h('li', {},
          h('div', { class: 'q-top' },
            h('span', { class: 'mono small', text: `${r.cpse} · ${r.legacyCode}` }),
            h('span', { class: 'pill', text: fmtDate(r.addedOn) })),
          h('span', { class: 'q-desc', text: r.raw }),
          h('div', { class: 'q-tags' },
            h('span', { class: 'pill k', text: r.family.label }),
            r.criticality ? h('span', { class: 'pill', text: r.criticality }) : null)
        ))))
    ]);
  }
}
