/**
 * Code Cosmos · Control Console
 * Everything that governs a run: corpus generation, signal weights,
 * decision thresholds and the raw rule inspector.
 */

import { h, clear, qs, fmtInt, toast, downloadFile, toCsv, debounce } from '../components/ui.js';
import { barChart } from '../viz/charts.js';
import { unitEquivalenceTable, buildRecord } from '../core/matcher.js';
import { tokenDiff, attributePills } from '../components/render.js';
import { recommend } from '../core/cnmc.js';

export function initConsole(store) {
  const sizeRange = qs('#sizeRange');
  const seedInput = qs('#seedInput');
  const tglShowcase = qs('#tglShowcase');
  const wSem = qs('#wSem'); const wFz = qs('#wFz'); const wAt = qs('#wAt');
  const autoRange = qs('#autoRange'); const floorRange = qs('#floorRange'); const candRange = qs('#candRange');

  sizeRange.value = String(store.config.size);
  seedInput.value = String(store.config.seed);
  autoRange.value = String(store.config.autoAccept);
  floorRange.value = String(store.config.reviewFloor);
  candRange.value = String(store.config.maxPairsPerRecord);
  wSem.value = String(store.config.weights.semantic);
  wFz.value = String(store.config.weights.fuzzy);
  wAt.value = String(store.config.weights.attribute);

  const syncLabels = () => {
    qs('#sizeVal').textContent = fmtInt(Number(sizeRange.value));
    qs('#wSemVal').textContent = Number(wSem.value).toFixed(2);
    qs('#wFzVal').textContent = Number(wFz.value).toFixed(2);
    qs('#wAtVal').textContent = Number(wAt.value).toFixed(2);
    qs('#autoVal').textContent = Number(autoRange.value).toFixed(2);
    qs('#floorVal').textContent = Number(floorRange.value).toFixed(2);
    qs('#candVal').textContent = candRange.value;
    const total = Number(wSem.value) + Number(wFz.value) + Number(wAt.value) || 1;
    qs('#wbSemBar').style.width = `${(Number(wSem.value) / total) * 100}%`;
    qs('#wbFzBar').style.width = `${(Number(wFz.value) / total) * 100}%`;
    qs('#wbAtBar').style.width = `${(Number(wAt.value) / total) * 100}%`;
  };
  [sizeRange, seedInput, autoRange, floorRange, candRange, wSem, wFz, wAt].forEach((el) => el.addEventListener('input', syncLabels));
  syncLabels();

  qs('#regenSeed').addEventListener('click', () => {
    seedInput.value = String(Math.floor(Math.random() * 900000) + 1000);
    toast('info', 'New seed ready', 'Press “Apply & run” to regenerate the corpus.');
  });

  qs('#downloadCorpus').addEventListener('click', () => {
    if (!store.records.length) return toast('warn', 'Run the pipeline first');
    const rows = store.records.map((r) => ({
      record_id: r.id, legacy_code: r.legacyCode, cpse: r.cpse, plant: r.unit,
      description: r.raw, normalized: r.normalized.text, family: r.family.label, type: r.type,
      attributes: r.specs.map((s) => `${s.key}=${s.text}`).join(' | '),
      ground_truth_concept: r.conceptId
    }));
    downloadFile('codecosmos-synthetic-corpus.csv', toCsv(rows), 'text/csv');
    toast('ok', 'Corpus exported', `${rows.length} rows including hidden ground truth (for evaluation only).`);
  });

  qs('#consoleRun').addEventListener('click', () => {
    store.config.size = Number(sizeRange.value);
    store.config.seed = Number(seedInput.value) || 20260129;
    store.config.includeShowcases = tglShowcase.checked;
    store.config.autoAccept = Number(autoRange.value);
    store.config.reviewFloor = Number(floorRange.value);
    store.config.maxPairsPerRecord = Number(candRange.value);
    store.config.useFuzzy = qs('#tglFuzzy').checked;
    store.config.useAttributes = qs('#tglAttr').checked;
    store.config.useUnits = qs('#tglUnits').checked;
    store.config.weights = { semantic: Number(wSem.value), fuzzy: Number(wFz.value), attribute: Number(wAt.value) };
    toast('info', 'Applying configuration', `${fmtInt(store.config.size)} records · auto band ≥ ${store.config.autoAccept.toFixed(2)}`);
    store.run().then(() => {
      renderRules();
      toast('ok', 'Run complete', `Pipeline finished in ${Math.round(store.pipeline.durationMs)} ms.`);
    });
  });

  /* ------------------------- unit standardisation ----------------------- */
  const unitHost = qs('#unitTable');
  clear(unitHost);
  unitEquivalenceTable().forEach((u) => {
    unitHost.append(h('div', { class: 'unit-row' },
      h('span', { class: 'uq', text: u.quantity }),
      h('span', { class: 'uw', text: u.asWritten }),
      h('span', { class: 'ue', text: '→' }),
      h('span', { class: 'ua', text: u.asStandard })
    ));
  });

  /* ------------------------------ inspector ----------------------------- */
  const ruleInput = qs('#ruleInput');
  const inspect = () => {
    const rec = buildRecord('inspect', ruleInput.value.trim() || ruleInput.value, { cpse: 'INSPECT' });
    const cn = recommend(rec, {});
    const out = qs('#ruleOut');
    clear(out);
    out.append(
      h('div', { class: 'rule-block' },
        h('span', { text: 'raw input' }), h('code', { text: rec.raw })),
      h('div', { class: 'rule-block' },
        h('span', { text: 'normalized (stage 1)' }), h('code', { text: rec.normalized.text || '—' }),
        tokenDiff(rec),
        h('span', { text: `rules: ${rec.normalized.rules.join(', ') || 'none'}` })),
      h('div', { class: 'rule-block' },
        h('span', { text: `attributes (${rec.specs.length})` }), attributePills(rec, 20)),
      h('div', { class: 'rule-block json-block' },
        h('span', { text: 'standardized JSON' }),
        h('pre', { class: 'json', text: JSON.stringify({
          family: rec.family.id,
          type: rec.type,
          cnmc: cn.code,
          cnmcClass: cn.classLabel,
          unit: cn.unit,
          completeness: Number(cn.completeness.toFixed(2)),
          missingCritical: cn.missingCritical,
          standardDescription: cn.standardDescription,
          attributes: rec.specs.map((s) => ({
            key: s.key, value: s.text, group: s.group, critical: s.critical,
            standardised: s.baseValue !== null ? { value: Number(s.baseValue.toFixed(4)), unit: s.baseUnit } : null,
            secondary: s.secondaryBaseValue !== null && s.secondaryBaseValue !== undefined ? Number(s.secondaryBaseValue.toFixed(4)) : undefined
          }))
        }, null, 2) }))
    );
  };
  qs('#ruleRun').addEventListener('click', inspect);
  ruleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') inspect(); });
  ruleInput.addEventListener('input', debounce(inspect, 350));
  inspect();

  /* --------------------------- rule activity ---------------------------- */
  const rulesCanvas = qs('#chartRules');
  rulesCanvas.dataset.height = '240';
  store.on('complete', () => renderRules());
  function renderRules() {
    const hits = store.metrics ? store.metrics.analytics.noiseRuleHits : [];
    if (!hits.length) return;
    barChart(rulesCanvas, {
      items: hits.map((r) => ({ label: r.rule, value: r.count })),
      horizontal: true, unit: 'descriptions'
    });
    rulesCanvas.dataset.height = '';
  }
}
