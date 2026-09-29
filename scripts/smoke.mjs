/**
 * Code Cosmos · headless smoke test
 * ------------------------------------------------------------------
 * Boots the real index.html inside jsdom, installs the browser APIs
 * jsdom lacks (canvas 2D, ResizeObserver, IntersectionObserver,
 * matchMedia, rAF) and then drives every view exactly the way a user
 * would: run the pipeline, click through tabs, approve a match,
 * exercise the live console, export files.
 *
 * Run: node smoke.mjs  (from the repo root, with jsdom installed)
 */
import { JSDOM, VirtualConsole } from '/home/user/.pwtest/node_modules/jsdom/lib/api.js';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const errors = [];
const warnings = [];

const vc = new VirtualConsole();
vc.on('jsdomError', (e) => {
  if (/Not implemented/.test(e.message)) return;           // jsdom gaps, not app bugs
  errors.push(`jsdomError: ${e.message}`);
});
vc.on('error', (m) => errors.push(`console.error: ${m}`));

const dom = new JSDOM(html, {
  url: 'http://localhost:8080/',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
  virtualConsole: vc
});
const { window } = dom;

// ---- browser API shims ----------------------------------------------------
function fakeCtx() {
  const noop = () => {};
  const gradient = { addColorStop: noop };
  const ctx = new Proxy({}, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => gradient;
      if (prop === 'measureText') return () => ({ width: 40 });
      if (prop === 'getImageData') return () => ({ data: [] });
      if (prop === 'canvas') return null;
      return noop;
    },
    set(t, prop, value) { t[prop] = value; return true; }
  });
  return ctx;
}
window.HTMLCanvasElement.prototype.getContext = function getContext() { return fakeCtx(); };
window.ResizeObserver = class ResizeObserver { observe() {} unobserve() {} disconnect() {} };
window.IntersectionObserver = class IntersectionObserver {
  constructor(cb) { this.cb = cb; }
  observe() {} unobserve() {} disconnect() {}
};
window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
window.performance = window.performance || { now: () => Date.now() };
window.URL.createObjectURL = () => 'blob:mock';
window.URL.revokeObjectURL = () => {};
window.print = () => {};
window.scrollTo = () => {};

// expose to module scope
const g = globalThis;
g.window = window;
g.document = window.document;
Object.defineProperty(g, 'navigator', { value: window.navigator, configurable: true });
g.location = window.location;
g.localStorage = window.localStorage;
g.HTMLCanvasElement = window.HTMLCanvasElement;
g.ResizeObserver = window.ResizeObserver;
g.IntersectionObserver = window.IntersectionObserver;
g.matchMedia = window.matchMedia;
g.requestAnimationFrame = window.requestAnimationFrame.bind(window);
g.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
g.CustomEvent = window.CustomEvent;
g.HTMLElement = window.HTMLElement;
g.Node = window.Node;
g.DOMParser = window.DOMParser;
g.getComputedStyle = window.getComputedStyle.bind(window);
g.MutationObserver = window.MutationObserver;

window.addEventListener('error', (e) => errors.push(`window error: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => errors.push(`unhandled rejection: ${e.reason}`));
const origError = console.error;
console.error = (...args) => { errors.push(`console.error: ${args.join(' ')}`); origError(...args); };
const origWarn = console.warn;
console.warn = (...args) => { warnings.push(String(args[0])); origWarn(...args); };

// ---- boot the real app ----------------------------------------------------
const mod = await import(pathToFileURL(path.join(ROOT, 'assets/js/main.js')).href);
void mod;

const q = (s) => window.document.querySelector(s);
const click = (s) => {
  const el = q(s);
  if (!el) throw new Error(`missing element ${s}`);
  el.click();
};
const assert = (cond, msg) => { if (!cond) errors.push(`assertion failed: ${msg}`); };

const { store } = await import(pathToFileURL(path.join(ROOT, 'assets/js/core/state.js')).href);

// wait for the automatic first run to finish
await new Promise((r) => setTimeout(r, 300));
for (let i = 0; i < 90; i++) {
  await new Promise((r) => setTimeout(r, 250));
  if (!store.running && store.records.length) break;
}

assert(window.document.getElementById('boot').classList.contains('gone'), 'boot overlay dismissed');

console.log('— engine —');
console.log('records        :', store.records.length);
console.log('candidate pairs:', store.pairs.length);
console.log('clusters       :', store.clusters.length);
console.log('master items   :', store.masterItems.length);
assert(store.records.length > 100, 'corpus generated');
assert(store.pairs.length > 100, 'candidate pairs generated');
assert(store.masterItems.length > 10, 'master items generated');
if (store.metrics) {
  console.log('precision/recall/F1:', store.metrics.precision.toFixed(3), store.metrics.recall.toFixed(3), store.metrics.f1.toFixed(3));
  console.log('purity         :', store.metrics.clusterPurity.toFixed(3), '| auto pairs:', store.metrics.autoCount, '| review queue:', store.metrics.reviewQueue);
}

// ---- router ---------------------------------------------------------------
console.log('\n— router —');
const views = ['overview', 'pipeline', 'explorer', 'workbench', 'review', 'benchmark', 'master', 'console', 'about'];
for (const v of views) {
  window.location.hash = `#/${v}`;
  window.dispatchEvent(new window.HashChangeEvent('hashchange'));
  await new Promise((r) => setTimeout(r, 120));
  const el = q(`#view-${v}`);
  assert(el && !el.hidden, `view ${v} visible`);
  const nodes = el.querySelectorAll('*').length;
  console.log(`  ${v.padEnd(10)} nodes=${String(nodes).padStart(5)}  hidden=${el.hidden}`);
  assert(nodes > 20, `view ${v} rendered content`);
}

// ---- interactions ---------------------------------------------------------
console.log('\n— interactions —');
window.location.hash = '#/workbench';
window.dispatchEvent(new window.HashChangeEvent('hashchange'));
await new Promise((r) => setTimeout(r, 150));

// select two showcase records (the SIH bearing example)
const bearing = store.records.filter((r) => r.conceptId === 'BRG-6205');
assert(bearing.length >= 4, 'showcase bearing rows present');
q('#wbSelectA').value = bearing[0].id;
q('#wbSelectA').dispatchEvent(new window.Event('change'));
q('#wbSelectB').value = bearing[3].id;
q('#wbSelectB').dispatchEvent(new window.Event('change'));
await new Promise((r) => setTimeout(r, 150));
const conf = q('#wbConfidence').textContent;
console.log('  workbench confidence for 6205 pair:', conf);
assert(/9[0-9]\.|100/.test(conf), 'SIH showcase pair scores high confidence');
assert(q('#attrBody').children.length > 0, 'attribute table populated');

// a genuinely different pair must be blocked
const other = store.records.find((r) => r.conceptId === 'BRG-6206');
if (other) {
  q('#wbSelectB').value = other.id;
  q('#wbSelectB').dispatchEvent(new window.Event('change'));
  await new Promise((r) => setTimeout(r, 120));
  const conf2 = q('#wbConfidence').textContent;
  console.log('  6205 vs 6206 confidence (must be blocked):', conf2);
  assert(parseFloat(conf2) < 60, 'different designation is not merged');
}

// approve a pair
click('#wbAccept');
await new Promise((r) => setTimeout(r, 120));
console.log('  decision recorded, review queue now:', store.pipeline.reviewQueue(999).length);
click('#wbReset');
await new Promise((r) => setTimeout(r, 100));

// live console
q('#pgInput').value = 'SKF 6205 BEARING';
click('#pgRun');
await new Promise((r) => setTimeout(r, 250));
assert(q('#pgOut').children.length >= 4, 'playground rendered 4 stages');
console.log('  live console blocks:', q('#pgOut').children.length);

// review queue: approve top 5 (if any)
window.location.hash = '#/review';
window.dispatchEvent(new window.HashChangeEvent('hashchange'));
await new Promise((r) => setTimeout(r, 150));
const queueRows = q('#reviewQueue').querySelectorAll('li').length;
console.log('  review queue rows:', queueRows);
if (queueRows) {
  q('#reviewQueue').querySelector('li').click();
  await new Promise((r) => setTimeout(r, 120));
  assert(q('#reviewDetailBody').children.length > 0, 'evidence packet rendered');
  const before = store.clusters.length;
  q('#reviewDetailBody').querySelector('.btn-ok').click();
  await new Promise((r) => setTimeout(r, 200));
  console.log('  after approval → clusters:', store.clusters.length, `(was ${before})`, '| master items:', store.masterItems.length);
}

// benchmark slider + exports
window.location.hash = '#/benchmark';
window.dispatchEvent(new window.HashChangeEvent('hashchange'));
await new Promise((r) => setTimeout(r, 150));
q('#thSlider').value = '0.8';
q('#thSlider').dispatchEvent(new window.Event('input'));
await new Promise((r) => setTimeout(r, 120));
console.log('  threshold readout cells:', q('#thReadout').children.length);
assert(q('#nearMiss').children.length > 0, 'near-miss gallery populated');
click('#exportBench');

// master exports + drawer
window.location.hash = '#/master';
window.dispatchEvent(new window.HashChangeEvent('hashchange'));
await new Promise((r) => setTimeout(r, 150));
click('#exportMasterCsv');
click('#exportMasterJson');
await new Promise((r) => setTimeout(r, 100));
const masterRows = q('#masterBody').querySelectorAll('tr').length;
masterRows && q('#masterBody').querySelector('tr').click();
await new Promise((r) => setTimeout(r, 150));
console.log('  master rows rendered:', masterRows, '| drawer items:', q('#drawerBody').children.length);
assert(q('#drawerBody').children.length > 2, 'drawer content rendered');
q('#drawer [data-close-drawer]').click();

// explorer
window.location.hash = '#/explorer';
window.dispatchEvent(new window.HashChangeEvent('hashchange'));
await new Promise((r) => setTimeout(r, 150));
q('#recordSearch').value = '6205';
q('#recordSearch').dispatchEvent(new window.Event('input'));
await new Promise((r) => setTimeout(r, 350));
console.log('  explorer search rows:', q('#recordBody').querySelectorAll('tr').length, '|', q('#recordCount').textContent);
assert(q('#recordBody').querySelectorAll('tr').length > 0, 'explorer search returns rows');
click('#exportRows');

// console view re-run with a small corpus
window.location.hash = '#/console';
window.dispatchEvent(new window.HashChangeEvent('hashchange'));
await new Promise((r) => setTimeout(r, 150));
q('#sizeRange').value = '80';
q('#autoRange').value = '0.9';
click('#ruleRun');
await new Promise((r) => setTimeout(r, 120));
assert(q('#ruleOut').children.length >= 4, 'rule inspector rendered');
click('#consoleRun');
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 250));
  if (!store.running && store.records.length === 80) break;
}
console.log('  re-run with 80 records →', store.records.length, 'records,', store.pairs.length, 'pairs, purity', store.metrics.clusterPurity.toFixed(3));
assert(store.records.length === 80, 'console re-run applied new corpus size');

// guided tour
click('#tourBtn');
await new Promise((r) => setTimeout(r, 200));
assert(q('#tourCard'), 'tour card opened');
for (let i = 0; i < 8; i++) {
  const next = [...q('#tourCard').querySelectorAll('button')].find((b) => /Next|Finish/.test(b.textContent));
  next.click();
  await new Promise((r) => setTimeout(r, 120));
}
await new Promise((r) => setTimeout(r, 150));
console.log('  tour finished, card removed:', !q('#tourCard'));

// theme + print + about
click('#themeBtn');
await new Promise((r) => setTimeout(r, 120));
console.log('  theme now:', window.document.documentElement.getAttribute('data-theme'));
click('#themeBtn');
window.location.hash = '#/about';
window.dispatchEvent(new window.HashChangeEvent('hashchange'));
await new Promise((r) => setTimeout(r, 120));
assert(q('#teamList').children.length >= 5, 'team list rendered');
assert(q('#roadmap').children.length === 4, 'roadmap rendered');

console.log('\n— summary —');
console.log('errors  :', errors.length);
errors.slice(0, 20).forEach((e) => console.log('  ✕', e));
console.log('warnings:', warnings.length);
[...new Set(warnings)].slice(0, 8).forEach((w) => console.log('  !', w));

if (errors.length) {
  process.exitCode = 1;
  console.log('\nSMOKE TEST FAILED');
} else {
  console.log('\nSMOKE TEST PASSED — all views, engine and exports exercised.');
}
