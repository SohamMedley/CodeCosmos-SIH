/**
 * Code Cosmos · Shared render helpers
 * ------------------------------------------------------------------
 * Pure functions returning DOM nodes for the pieces that appear in
 * several views (normalization diffs, attribute pills, signal bars,
 * confidence gauges, evidence packets).
 */

import { h, fmtPct, fmtNum, escapeHtml, truncate } from './ui.js';


export function confidenceTone(v) {
  if (v >= 0.85) return 'ok';
  if (v >= 0.75) return 'info';
  if (v >= 0.55) return 'warn';
  return 'bad';
}

export function bandChip(band) {
  return h('span', { class: `band-pill ${band.tone}`, text: band.short, title: `${band.label} · ${band.action}` });
}

/** Coloured token sequence showing what normalization did to a raw string. */
export function tokenDiff(record) {
  const segs = record.normalized.segments || [];
  const wrap = h('div', { class: 'diff-tokens' });
  if (!segs.length) {
    wrap.append(h('span', { class: 'tok keep', text: record.normalized.text || '—' }));
    return wrap;
  }
  segs.forEach((s) => {
    if (s.kind === 'keep') wrap.append(h('span', { class: 'tok keep', text: s.out, title: 'kept' }));
    else if (s.kind === 'replaced') wrap.append(h('span', { class: 'tok replaced', text: `${s.src} → ${s.out}`, title: s.rule || 'expanded' }));
    else if (s.kind === 'removed') wrap.append(h('span', { class: 'tok removed', text: s.src, title: `removed (${s.rule})` }));
    else if (s.kind === 'neutralized') wrap.append(h('span', { class: 'tok neutralized', text: s.src, title: 'vendor neutralised' }));
  });
  return wrap;
}

export function attributePills(record, limit = 14) {
  const wrap = h('div', { class: 'attr-pills' });
  const specs = (record.specs || []).slice(0, limit);
  if (!specs.length) {
    wrap.append(h('span', { class: 'pill', text: 'no structured attributes' }));
    return wrap;
  }
  specs.forEach((s) => {
    const std = s.baseValue !== null && s.baseUnit ? ` → ${fmtNum(s.baseValue, s.quantity === 'length' && s.baseValue < 10 ? 2 : 1)} ${s.baseUnit}` : '';
    wrap.append(h('span', {
      class: `pill ${s.critical ? 'crit' : 'k'}`,
      title: `${s.group}${s.critical ? ' · decisive' : ''}`,
      text: `${s.key}=${s.text}${std}`
    }));
  });
  return wrap;
}

export function attributeTable(record) {
  const rows = (record.specs || []).map((s) => h('tr', {},
    h('td', { text: s.label }),
    h('td', { class: 'mono', text: s.text }),
    h('td', { class: 'mono muted', text: s.baseValue !== null && s.baseUnit ? `${fmtNum(s.baseValue, 3)} ${s.baseUnit}` : '—' }),
    h('td', {}, h('span', { class: `pill ${s.critical ? 'crit' : ''}`, text: s.group }))
  ));
  if (!rows.length) rows.push(h('tr', {}, h('td', { colspan: '4', class: 'muted', text: 'No structured attributes extracted from this description.' })));
  return h('div', { class: 'table-scroll' }, h('table', { class: 'tbl compact' },
    h('thead', {}, h('tr', {}, h('th', { text: 'Attribute' }), h('th', { text: 'As written' }), h('th', { text: 'Standardised' }), h('th', { text: 'Group' }))),
    h('tbody', {}, rows)
  ));
}

export function signalBars(scores, { penalties = [] } = {}) {
  const wrap = h('div', { class: 'signal-bars' });
  const rows = [
    ['semantic', 'Semantic similarity', scores.semantic],
    ['fuzzy', 'Fuzzy text similarity', scores.fuzzy],
    ['attribute', 'Technical attributes', scores.attribute === null || scores.attribute === undefined ? null : scores.attribute]
  ];
  rows.forEach(([cls, label, value]) => {
    const pct = value === null ? 0 : Math.max(0, Math.min(1, value));
    wrap.append(h('div', { class: `sig ${cls}` },
      h('div', { class: 'sig-top' }, h('span', { text: label }), h('b', { text: value === null ? 'n/a' : fmtPct(value) })),
      h('div', { class: 'sig-bar' }, h('i', { style: { width: `${pct * 100}%` } }))
    ));
  });
  penalties.forEach(([label, value]) => {
    wrap.append(h('div', { class: 'sig penalty' },
      h('div', { class: 'sig-top' }, h('span', { text: label }), h('b', { text: fmtPct(value) })),
      h('div', { class: 'sig-bar' }, h('i', { style: { width: `${Math.min(100, value * 100)}%` } }))
    ));
  });
  return wrap;
}

/** One record's raw → normalized → standardized stack. */
export function recordPane(record, { store, compact = false } = {}) {
  const wrap = h('div', { class: 'wb-pane-head' });
  wrap.append(
    h('div', { class: 'raw-block' }, h('span', { class: 'lbl', text: 'as stored in CPSE system' }), record.raw),
    h('div', { class: 'raw-block' }, h('span', { class: 'lbl', text: 'normalized (stage 1)' }), record.normalized.text || '—')
  );
  wrap.append(h('div', { class: 'dr-block' }, h('h4', { text: 'token transformation' }), tokenDiff(record)));
  wrap.append(h('div', { class: 'dr-block' }, h('h4', { text: `technical attributes (${record.specs.length})` }), attributePills(record, compact ? 8 : 20)));
  wrap.append(h('div', { class: 'sc-chips' },
    h('span', { class: 'sc-chip c', text: `family: ${record.family.label}` }),
    h('span', { class: 'sc-chip', text: `type: ${record.type}` }),
    record.normalized.brand ? h('span', { class: 'sc-chip', text: `vendor neutralised: ${record.normalized.brand}` }) : null,
    record.normalized.partNo ? h('span', { class: 'sc-chip', text: `part no. removed: ${record.normalized.partNo}` }) : null
  ));
  if (!compact) {
    const master = store.masterForRecord(record.id);
    if (master) {
      wrap.append(h('div', { class: 'out-cell' },
        h('span', { text: 'harmonized master item' }),
        h('strong', {}, h('code', { text: master.code })),
        h('p', { class: 'small muted', text: master.standardDescription })
      ));
    }
  }
  return wrap;
}

/** Full evidence packet for a candidate pair — used by the review queue. */
export function evidencePacket(pair, store) {
  const wrap = h('div', { class: 'stack' });
  const tone = confidenceTone(pair.confidence);

  wrap.append(h('div', { class: 'out-grid' },
    h('div', { class: 'out-cell' }, h('span', { text: 'confidence' }), h('strong', { class: `ch-${tone}`, text: fmtPct(pair.confidence) })),
    h('div', { class: 'out-cell' }, h('span', { text: 'decision band' }), h('strong', { text: pair.band.label })),
    h('div', { class: 'out-cell' }, h('span', { text: 'signals' }),
      h('strong', { class: 'mono small', text: `sem ${fmtPct(pair.scores.semantic)} · fz ${fmtPct(pair.scores.fuzzy)} · attr ${pair.scores.attribute === null ? 'n/a' : fmtPct(pair.scores.attribute)}` })),
    h('div', { class: 'out-cell' }, h('span', { text: 'conflicts' }),
      h('strong', { text: `${pair.conflicts.length} (${pair.criticalConflicts} decisive)` }))
  ));

  wrap.append(signalBars(pair.scores));

  const rows = [];
  pair.matched.forEach((m) => rows.push(h('tr', {},
    h('td', { text: m.label }),
    h('td', { class: 'mono small', text: m.detail }),
    h('td', {}, h('span', { class: 'pill k', text: m.verdict === 'approx' ? 'near match' : 'match' }))
  )));
  pair.conflicts.forEach((c) => rows.push(h('tr', {},
    h('td', { text: c.label }),
    h('td', { class: 'mono small', text: c.detail }),
    h('td', {}, h('span', { class: 'pill crit', text: c.critical ? 'decisive conflict' : 'conflict' }))
  )));
  (pair.missing || []).slice(0, 8).forEach((m) => rows.push(h('tr', {},
    h('td', { text: m.label }),
    h('td', { class: 'mono small', text: `present only in ${m.presentIn}` }),
    h('td', {}, h('span', { class: 'pill', text: 'one-sided' }))
  )));
  wrap.append(h('div', { class: 'table-scroll' }, h('table', { class: 'tbl compact' },
    h('thead', {}, h('tr', {}, h('th', { text: 'Attribute' }), h('th', { text: 'Evidence' }), h('th', { text: 'Verdict' }))),
    h('tbody', {}, rows.length ? rows : h('tr', {}, h('td', { colspan: '3', class: 'muted', text: 'No structured attributes on either record — decision rests on semantic and fuzzy text evidence only.' })))
  )));

  const pairBoxes = h('div', { class: 'split' },
    h('div', { class: 'out-cell' }, h('span', { text: `${pair.a.cpse} · ${pair.a.legacyCode}` }),
      h('p', { class: 'mono small', text: pair.a.raw }),
      h('p', { class: 'small muted', text: `normalized: ${pair.a.normalized.text}` })),
    h('div', { class: 'out-cell' }, h('span', { text: `${pair.b.cpse} · ${pair.b.legacyCode}` }),
      h('p', { class: 'mono small', text: pair.b.raw }),
      h('p', { class: 'small muted', text: `normalized: ${pair.b.normalized.text}` }))
  );
  wrap.append(pairBoxes);

  const master = store
    ? (store.masterForRecord(pair.a.id) || store.masterForRecord(pair.b.id))
    : null;
  if (master) {
    wrap.append(h('div', { class: 'out-cell' },
      h('span', { text: 'would map to master item' }),
      h('strong', {}, h('code', { text: master.code })),
      h('p', { class: 'small muted', text: master.standardDescription })
    ));
  }

  const actions = h('div', { class: 'verdict-actions' },
    h('button', { class: 'btn btn-ok', onclick: () => store.decide(pair.key, 'accepted') }, 'Approve match'),
    h('button', { class: 'btn btn-bad', onclick: () => store.decide(pair.key, 'rejected') }, 'Reject match')
  );
  wrap.append(actions);
  return wrap;
}
