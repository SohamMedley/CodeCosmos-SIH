/**
 * Code Cosmos · Expert Review
 * The human-in-the-loop surface. Only uncertain pairs reach this queue;
 * every decision is attributed, logged and immediately reflected in the
 * clusters, the master and the benchmark.
 */

import { h, clear, qs, fmtPct, fmtInt, fmtTime, icon } from '../components/ui.js';
import { evidencePacket, bandChip, confidenceTone } from '../components/render.js';

export function initReview(store) {
  let selected = null;

  store.on('complete', () => render());
  store.on('decision', () => render());

  qs('#reviewAll').addEventListener('click', () => {
    const keys = store.pipeline.reviewQueue(999).map((p) => p.key);
    if (!keys.length) return;
    store.decideMany(keys, 'accepted');
    render();
  });
  qs('#reviewAuto').addEventListener('click', () => {
    const keys = store.pipeline.reviewQueue(10).map((p) => p.key);
    if (!keys.length) return;
    store.decideMany(keys, 'accepted');
    render();
  });

  // Keyboard-first review, like a real master-data desk.
  document.addEventListener('keydown', (e) => {
    if (store.view !== 'review' || !selected) return;
    if (e.target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.key === 'a' || e.key === 'A') { store.decide(selected.key, 'accepted'); render(); }
    if (e.key === 'r' || e.key === 'R') { store.decide(selected.key, 'rejected'); render(); }
  });

  function render() {
    if (!store.pairs.length) return;
    const queue = store.pipeline.reviewQueue(60);
    // Land on the first case so the evidence panel is never an empty box.
    if (!selected && queue.length) selected = queue[0];
    if (selected && !queue.some((p) => p.key === selected.key) && !store.decisions.has(selected.key)) {
      selected = queue[0] || null;
    }
    const decided = [...store.decisions.entries()];
    const stats = qs('#reviewStats');
    clear(stats);

    const autoCount = store.metrics ? store.metrics.autoCount : 0;
    const reviewCount = store.metrics ? store.metrics.reviewQueue : 0;
    const cards = [
      ['Handled by AI (auto band)', fmtInt(autoCount), 'no human touch required'],
      ['Waiting on your desk', fmtInt(reviewCount), 'uncertain matches only'],
      ['Decisions recorded', fmtInt(decided.length), 'attributed to reviewers'],
      ['Expert decision accuracy', store.metrics && store.metrics.decisionAccuracy !== null ? fmtPct(store.metrics.decisionAccuracy, 0) : '—', 'against hidden ground truth']
    ];
    cards.forEach(([kl, kv, kd]) => stats.append(h('div', { class: 'kpi-card' },
      h('span', { class: 'kl', text: kl }), h('span', { class: 'kv', text: kv }), h('span', { class: 'kd', text: kd }))));

    const host = qs('#reviewQueue');
    clear(host);
    qs('#reviewCount').textContent = queue.length < reviewCount
      ? `Showing ${fmtInt(queue.length)} of ${fmtInt(reviewCount)} open cases — hardest first`
      : `${fmtInt(queue.length)} open case(s) — hardest first`;
    if (!queue.length) {
      host.append(h('div', { class: 'empty-state' }, h('div', { class: 'empty-ico' }, icon('check', { size: 30 })),
        h('p', { text: 'Queue clear. Every uncertain case has been decided — the rest of the corpus flowed through in the auto-accept band.' })));
    }
    queue.forEach((p) => {
      const li = h('li', { class: selected && selected.key === p.key ? 'sel' : '', onclick: () => { selected = p; render(); } },
        h('div', { class: 'q-top' },
          h('span', { class: `q-conf ch-${confidenceTone(p.confidence)}`, text: fmtPct(p.confidence, 1) }),
          bandChip(p.band)),
        h('span', { class: 'q-desc', text: `${p.a.cpse}: ${p.a.raw}` }),
        h('span', { class: 'q-desc', text: `${p.b.cpse}: ${p.b.raw}` }),
        h('div', { class: 'q-tags' },
          p.criticalConflicts ? h('span', { class: 'pill crit', text: `${p.criticalConflicts} decisive conflict` }) : null,
          h('span', { class: 'pill', text: `${p.matched.length} attribute match(es)` }),
          (p.missing || []).length ? h('span', { class: 'pill', text: `${p.missing.length} one-sided` }) : null)
      );
      host.append(li);
    });

    if (selected) {
      const fresh = store.pairs.find((p) => p.key === selected.key) || selected;
      selected = fresh;
      const body = qs('#reviewDetailBody');
      clear(body);
      body.classList.remove('empty-state');
      body.append(
        h('p', { class: 'small muted', text: 'Shortcuts: press A to approve, R to reject. Every decision is logged with a timestamp.' }),
        evidencePacket(fresh, store)
      );
    }

    const log = qs('#decisionLog');
    clear(log);
    const recent = store.pipeline.auditLog.filter((a) => /approved|rejected|cleared|decision/i.test(a.action)).slice(0, 25);
    if (!recent.length) {
      log.append(h('li', { class: 'info' }, h('time', { text: '—' }), h('div', {}, h('strong', { text: 'No decisions recorded yet' }), h('p', { text: 'Approve or reject a case to open the audit trail.' }))));
    }
    recent.forEach((a) => log.append(h('li', { class: a.tone },
      h('time', { text: fmtTime(a.at) }),
      h('div', {}, h('strong', { text: a.action }), h('p', { text: a.detail })))));
  }
}
