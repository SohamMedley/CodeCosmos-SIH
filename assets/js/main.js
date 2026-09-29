/**
 * Code Cosmos · Application entry point
 * ------------------------------------------------------------------
 * Hash router + view bootstrapping + global chrome (theme, sidebar,
 * progress chrome, keyboard shortcuts). Everything below runs in the
 * browser: there is no server component in this prototype.
 */

import { store } from './core/state.js';
import { qs, qsa, toast, initDrawer, initReveal, fmtInt, fmtMs, hydrateIcons } from './components/ui.js';
import { startTour, stopTour, isTourActive } from './components/tour.js';
import { watchTheme, redrawAll } from './viz/charts.js';

import { initOverview } from './views/overview.js';
import { initPipeline } from './views/pipeline.js';
import { initExplorer } from './views/explorer.js';
import { initWorkbench } from './views/workbench.js';
import { initReview } from './views/review.js';
import { initBenchmark } from './views/benchmark.js';
import { initMaster } from './views/master.js';
import { initConsole } from './views/console.js';
import { initAbout } from './views/about.js';

const VIEWS = ['overview', 'pipeline', 'explorer', 'workbench', 'review', 'benchmark', 'master', 'console', 'about'];
function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('codecosmos.theme'); } catch (e) { /* storage disabled */ }
  // Light is the primary aesthetic; dark is used only when the visitor's
  // system explicitly asks for it (and has not chosen a theme here).
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  store.setTheme(saved || (prefersDark ? 'dark' : 'light'));
  qs('#themeBtn').addEventListener('click', () => {
    store.setTheme(store.theme === 'dark' ? 'light' : 'dark');
    setTimeout(() => redrawAll(), 60);
  });
}

function initRouter() {
  const route = () => {
    const raw = (location.hash || '#/overview').replace(/^#\/?/, '').split('?')[0];
    const view = VIEWS.includes(raw) ? raw : 'overview';
    VIEWS.forEach((v) => { qs(`#view-${v}`).hidden = v !== view; });
    qsa('.nav-link').forEach((a) => a.classList.toggle('active', a.dataset.view === view));
    store.setView(view);
    hydrateIcons(qs(`#view-${view}`) || document);
    closeSidebar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => redrawAll(), 80);
  };
  window.addEventListener('hashchange', route);
  route();
  return route;
}

function closeSidebar() {
  qs('#sidebar').classList.remove('open');
  qs('#menuBtn').setAttribute('aria-expanded', 'false');
}

function initChrome() {
  const btn = qs('#menuBtn');
  btn.addEventListener('click', () => {
    const open = qs('#sidebar').classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => {
    if (window.innerWidth > 900) return;
    if (e.target.closest('.sidebar') || e.target.closest('#menuBtn')) return;
    closeSidebar();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSidebar();
    if ((e.key === 'r' || e.key === 'R') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      store.run().catch((err) => toast('bad', 'Pipeline error', String(err.message || err)));
    }
  });
  hydrateIcons();
  initDrawer();
  initReveal();
  watchTheme(() => redrawAll());
}

function initGlobalProgress() {
  const chip = qs('#engineChip');
  store.on('status', (e) => {
    const status = typeof e === 'string' ? e : e.status;
    qs('#engineLabel').textContent = status === 'running' ? 'Harmonizing' : status === 'ready' ? 'Engine ready' : 'Idle';
    chip.classList.toggle('is-ready', status === 'ready');
    chip.classList.toggle('is-running', status === 'running');
  });
  store.on('progress', (p) => {
    if (p.pct !== undefined) {
      document.documentElement.style.setProperty('--run-progress', `${p.pct}%`);
    }
    const review = store.pipeline.reviewQueue(999).length;
    if (p.pct === 100) {
      const m = store.metrics;
      if (m) {
        qs('#navRecords').textContent = fmtInt(m.records);
        qs('#navReview').textContent = fmtInt(m.reviewQueue);
        qs('#navMaster').textContent = fmtInt(m.clusters);
        qs('#footStats').textContent = `${fmtInt(m.records)} records · ${fmtInt(m.candidatePairs)} pairs scored · ${fmtMs(m.durationMs)} in-browser`;
      }
      void review;
    }
  });
  store.on('complete', (snap) => {
    const m = snap.metrics;
    qs('#sidebar').classList.add('has-run');
    qs('#navRecords').textContent = fmtInt(m.records);
    qs('#navReview').textContent = fmtInt(m.reviewQueue);
    qs('#navMaster').textContent = fmtInt(m.clusters);
    qs('#footStats').textContent = `${fmtInt(m.records)} records · ${fmtInt(m.candidatePairs)} pairs scored · ${fmtMs(m.durationMs)} in-browser`;
  });
  store.on('decision', (e) => {
    const m = store.metrics;
    if (m) {
      qs('#navReview').textContent = fmtInt(store.pipeline.reviewQueue(999).length);
      qs('#navMaster').textContent = fmtInt(m.clusters);
    }
    if (!e.bulk && e.verdict) toast(e.verdict === 'accepted' ? 'ok' : 'warn', e.verdict === 'accepted' ? 'Recorded: match approved' : 'Recorded: match rejected', 'Clusters, master and metrics updated.');
  });
  store.on('error', (err) => toast('bad', 'Engine error', String(err && err.message ? err.message : err)));
}

function initRunButton() {
  qs('#runBtn').addEventListener('click', async () => {
    const btn = qs('#runBtn');
    btn.disabled = true;
    const label = btn.querySelector('span');
    const original = label.textContent;
    label.textContent = 'Running …';
    try {
      await store.run();
      toast('ok', 'Harmonization complete', `${fmtInt(store.metrics.records)} records processed in ${fmtMs(store.metrics.durationMs)}.`);
    } catch (err) {
      toast('bad', 'Pipeline error', String(err.message || err));
    } finally {
      btn.disabled = false;
      label.textContent = original;
      redrawAll();
    }
  });
}

async function start() {
  initTheme();
  initChrome();
  initGlobalProgress();
  const route = initRouter();
  initRunButton();

  qs('#tourBtn').addEventListener('click', () => {
    if (isTourActive()) { stopTour(); return; }
    startTour(store, { navigate: (view) => { location.hash = `#/${view}`; route(); } });
  });

  initOverview(store);
  initPipeline(store);
  initExplorer(store);
  initWorkbench(store);
  initReview(store);
  initBenchmark(store);
  initMaster(store);
  initConsole(store);
  initAbout(store);

  // The interface is usable immediately — the first harmonization run is
  // watched live in the Overview hero instead of behind a loading screen.
  try {
    await store.run();
    const m = store.metrics;
    toast('ok', 'Engine ready', `${fmtInt(m.records)} legacy rows harmonized into ${fmtInt(m.clusters)} standard items in ${fmtMs(m.durationMs)}.`, 6000);
  } catch (err) {
    toast('bad', 'Could not run the pipeline', String(err.message || err));
  }
  redrawAll();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
