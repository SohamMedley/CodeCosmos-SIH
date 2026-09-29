/**
 * Code Cosmos · Application state
 * ------------------------------------------------------------------
 * One small observable store. Views subscribe to the events they care
 * about (`progress`, `complete`, `decision`, `master`, `theme`) instead
 * of polling, which keeps the UI in lock-step with the engine.
 */

import { Pipeline } from './pipeline.js';
import { generateDataset } from '../data/catalog.js';

export const EVENTS = ['progress', 'status', 'records', 'pairs', 'clusters', 'master', 'audit', 'dataset', 'decision', 'complete', 'theme', 'view'];

export class Store {
  constructor() {
    this.listeners = new Map();
    this.theme = document.documentElement.getAttribute('data-theme') || 'dark';
    this.view = 'overview';
    this.config = {
      size: 260,
      seed: 20260129,
      includeShowcases: true,
      autoAccept: 0.85,
      reviewFloor: 0.55,
      maxPairsPerRecord: 8,
      useAttributes: true,
      useFuzzy: true,
      useUnits: true,
      weights: { semantic: 0.32, fuzzy: 0.24, attribute: 0.44 }
    };
    this.records = [];
    this.pairs = [];
    this.clusters = [];
    this.masterItems = [];
    this.metrics = null;
    this.dataset = null;
    this.points2d = null;
    this.pointByRecord = new Map();
    this.decisions = new Map();
    this.selection = { a: null, b: null };
    this.running = false;
    this.pipeline = this.createPipeline();
    this.pipeline.on((type, payload) => this.forward(type, payload));
  }

  createPipeline() {
    return new Pipeline({
      size: this.config.size,
      seed: this.config.seed,
      includeShowcases: this.config.includeShowcases,
      autoAccept: this.config.autoAccept,
      reviewFloor: this.config.reviewFloor,
      maxPairsPerRecord: this.config.maxPairsPerRecord,
      useAttributes: this.config.useAttributes,
      useFuzzy: this.config.useFuzzy,
      useUnits: this.config.useUnits,
      weights: { ...this.config.weights }
    });
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return () => this.listeners.get(event).delete(fn);
  }

  emit(event, payload) {
    const set = this.listeners.get(event);
    if (set) for (const fn of set) fn(payload, this);
  }

  forward(type, payload, pipeline) {
    switch (type) {
      case 'progress': this.emit('progress', payload); break;
      case 'status': this.emit('status', { status: payload, pipeline }); break;
      case 'records': this.emit('records', payload); break;
      case 'pairs': this.emit('pairs', payload); break;
      case 'clusters': this.emit('clusters', payload); break;
      case 'master': this.emit('master', payload); break;
      case 'embedded': this.points2d = payload.points; this.emit('embedded', payload); break;
      case 'dataset': this.dataset = payload; this.emit('dataset', payload); break;
      case 'decision': this.emit('decision', payload); break;
      case 'audit': this.emit('audit', payload); break;
      default: break;
    }
    void pipeline;
  }

  /** Rebuild the engine with current config and run it. */
  async run(options = {}) {
    if (this.running) return this.snapshot();
    this.running = true;
    this.emit('status', { status: 'running' });
    this.pipeline = this.createPipeline();
    this.pipeline.on((type, payload) => this.forward(type, payload));
    const dataset = options.dataset || generateDataset({
      size: this.config.size,
      seed: this.config.seed,
      includeShowcases: this.config.includeShowcases
    });
    let snapshot;
    try {
      snapshot = await this.pipeline.run(dataset);
      this.applySnapshot(snapshot);
      this.emit('complete', snapshot);
    } catch (err) {
      this.emit('error', err);
      throw err;
    } finally {
      this.running = false;
    }
    return snapshot;
  }

  applySnapshot(snap) {
    this.records = snap.records;
    this.pairs = snap.pairs;
    this.clusters = snap.clusters;
    this.masterItems = snap.masterItems;
    this.metrics = snap.metrics;
    this.points2d = this.pipeline.points2d || this.points2d;
    this.pointByRecord = new Map();
    if (this.points2d) {
      snap.records.forEach((r, i) => {
        if (this.points2d[i]) this.pointByRecord.set(r.id, this.points2d[i]);
      });
    }
    if (!this.selection.a && snap.records.length) {
      const showcase = snap.records.find((r) => r.normalized.brand || r.conceptId === 'BRG-6205') || snap.records[0];
      const partner = snap.pairs.find((p) => p.a.id === showcase.id || p.b.id === showcase.id);
      this.selection = {
        a: showcase.id,
        b: partner ? (partner.a.id === showcase.id ? partner.b.id : partner.a.id) : snap.records[1].id
      };
    }
  }

  /** Human decision, routed to the engine so clusters + metrics recompute. */
  decide(pairKey, verdict) {
    this.pipeline.decide(pairKey, verdict);
    this.decisions.set(pairKey, verdict);
    const snap = this.pipeline.snapshot();
    this.applySnapshot(snap);
    this.emit('decision', { pairKey, verdict, snapshot: snap });
    return snap;
  }

  decideMany(keys, verdict) {
    for (const key of keys) {
      this.pipeline.decisions.set(key, verdict);
      this.decisions.set(key, verdict);
      const pair = this.pipeline.pairs.find((p) => p.key === key);
      if (pair) {
        this.pipeline.log(verdict === 'accepted' ? 'Match approved' : 'Match rejected',
          `${pair.a.legacyCode || pair.a.id} ↔ ${pair.b.legacyCode || pair.b.id} · confidence ${(pair.confidence * 100).toFixed(1)}%`,
          verdict === 'accepted' ? 'ok' : 'warn');
      }
    }
    this.pipeline.rebuildClusters();
    this.pipeline.buildMasterItems();
    this.pipeline.metrics = this.pipeline.computeMetrics();
    const snap = this.pipeline.snapshot();
    this.applySnapshot(snap);
    this.emit('decision', { bulk: true, verdict, snapshot: snap });
    return snap;
  }

  recordById(id) { return this.records.find((r) => r.id === id) || null; }

  pairFor(aId, bId) {
    const key = aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
    return this.pairs.find((p) => p.key === key) || null;
  }

  masterForRecord(id) {
    return this.masterItems.find((m) => m.memberIds.includes(id)) || null;
  }

  clusterForRecord(id) {
    return this.clusters.find((c) => c.memberIds.includes(id)) || null;
  }

  bestBandForRecord(id) {
    let best = null;
    for (const p of this.pairs) {
      if (p.a.id !== id && p.b.id !== id) continue;
      if (!best || p.confidence > best.confidence) best = p;
    }
    return best;
  }

  /**
   * @param {'light'|'dark'} theme
   * @param {boolean} persist  Only an explicit user choice is written to
   *   localStorage. A theme merely inferred from the OS setting must stay
   *   unpersisted, otherwise it would win over any future OS change.
   */
  setTheme(theme, persist = true) {
    this.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    if (persist) {
      try { localStorage.setItem('codecosmos.theme', theme); } catch (e) { /* storage disabled */ }
    }
    this.emit('theme', theme);
  }

  setView(view) {
    this.view = view;
    this.emit('view', view);
  }
}

export const store = new Store();
export { generateDataset };
