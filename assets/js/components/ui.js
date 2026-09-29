/**
 * Code Cosmos · UI primitives
 * ------------------------------------------------------------------
 * Tiny DOM helper + toast/drawer/counter/pager utilities. No framework,
 * no build step — everything is a plain ES module so the static deploy
 * needs only a file server.
 */

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset' && typeof v === 'object') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const child of children.flat(4)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; }
export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }


/* ------------------------------------------------------------------ *
 * Inline icon set.
 * The prototype originally used unicode glyphs (◎ ⌗ ⋈ ✦ …) for its
 * iconography, but coverage for those codepoints varies by platform —
 * on some Linux and Windows font stacks they render as tofu boxes or
 * colourful emoji. Everything is therefore an explicit inline SVG now.
 * ------------------------------------------------------------------ */
export const ICONS = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.4V12l3.2 2.1"/>',
  duplicates: '<path d="M12 3.4 3.6 8 12 12.6 20.4 8z"/><path d="M4 12.6 12 17.2l8-4.6"/><path d="M4 16.8 12 21.4l8-4.6"/>',
  shield: '<path d="M12 3.4 5 6v6c0 4 3 7.2 7 8.6 4-1.4 7-4.6 7-8.6V6z"/><path d="M9 12l2.2 2.2L15.4 10"/>',
  map: '<rect x="3.4" y="3.4" width="7.2" height="7.2" rx="2"/><rect x="13.4" y="3.4" width="7.2" height="7.2" rx="2"/><rect x="3.4" y="13.4" width="7.2" height="7.2" rx="2"/><path d="M17 13.6v6.4M13.8 16.8h6.4"/>',
  gauge: '<path d="M4 17.2a8 8 0 1 1 16 0"/><path d="M12 17.2l4.3-5.3"/><circle cx="12" cy="17.2" r="1.2" fill="currentColor" stroke="none"/>',
  flow: '<path d="M3.6 8.4h13.2l-3.1-3.1M20.4 15.6H7.2l3.1 3.1"/>',
  table: '<rect x="3.4" y="4.4" width="17.2" height="15.2" rx="3"/><path d="M3.4 9.6h17.2M9.4 9.6v10"/>',
  columns: '<rect x="3.4" y="4.4" width="7.4" height="15.2" rx="2.6"/><rect x="13.2" y="4.4" width="7.4" height="15.2" rx="2.6"/>',
  checkSquare: '<rect x="3.4" y="3.4" width="17.2" height="17.2" rx="4.2"/><path d="M8.2 12.2l2.6 2.6 5-5.2"/>',
  chart: '<path d="M3.6 20.2h16.8"/><path d="M6.6 20.2v-6.4M11 20.2V6.4M15.4 20.2v-9.2M19.6 20.2v-4"/>',
  archive: '<path d="M4 5.6A2.2 2.2 0 0 1 6.2 3.4h11.6A2.2 2.2 0 0 1 20 5.6v15H6.2A2.2 2.2 0 0 1 4 18.4z"/><path d="M8.2 3.4v17.2M12.4 8.6h4"/>',
  sliders: '<path d="M4 7.4h9M17.6 7.4H20M4 16.6h3.4M12 16.6h8"/><circle cx="15.4" cy="7.4" r="2.1"/><circle cx="9.8" cy="16.6" r="2.1"/>',
  sparkles: '<path d="M11.6 3.6l1.6 4.1 4.1 1.6-4.1 1.6-1.6 4.1-1.6-4.1L5.9 9.3l4.1-1.6z"/><path d="M18.4 14.8l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"/>',
  arrowDown: '<path d="M12 4.8v13.4M6.6 12.8 12 18.2l5.4-5.4"/>',
  chevron: '<path d="M9.2 5.6 15.8 12l-6.6 6.4"/>',
  refresh: '<path d="M19.8 12a7.8 7.8 0 1 1-2.3-5.5"/><path d="M20 4.4v5.4h-5.4"/>',
  alert: '<path d="M12 4.4 2.9 19.6h18.2z"/><path d="M12 9.8v4.2M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11.2v5M12 7.9h.01"/>',
  close: '<path d="M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8"/>',
  check: '<path d="M5 12.6 9.6 17.2 19 7.4"/>',
  bolt: '<path d="M13.4 3 5.6 13.4h5.2l-1 7.6 8-11h-5.2z"/>',
  semantic: '<circle cx="12" cy="12" r="2.4"/><path d="M7.6 7.6a6.3 6.3 0 0 0 0 8.8M16.4 16.4a6.3 6.3 0 0 0 0-8.8M4.6 4.6a10.5 10.5 0 0 0 0 14.8M19.4 19.4a10.5 10.5 0 0 0 0-14.8"/>',
  fuzzy: '<path d="M3.6 9.2c2-3.2 4-3.2 6 0s4 3.2 6 0 2.6-2.4 4.8-.4M3.6 15.4c2-3.2 4-3.2 6 0s4 3.2 6 0 2.6-2.4 4.8-.4"/>',
  tag: '<path d="M11.2 3.4H20.6V12.8L12 21.4 3.4 12.8z"/><circle cx="16.8" cy="7.2" r="1.5"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  database: '<ellipse cx="12" cy="6.2" rx="7.4" ry="2.9"/><path d="M4.6 6.2v11.6c0 1.6 3.3 2.9 7.4 2.9s7.4-1.3 7.4-2.9V6.2"/><path d="M4.6 12c0 1.6 3.3 2.9 7.4 2.9s7.4-1.3 7.4-2.9"/>',
  users: '<circle cx="9.2" cy="8.2" r="3.2"/><path d="M3.6 19.2c0-3 2.5-5.2 5.6-5.2s5.6 2.2 5.6 5.2"/><path d="M16.2 6.2a3.2 3.2 0 0 1 0 6M17.8 19.2c0-2.2-.8-4-2-5.1"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.4"/><path d="M15.6 15.6 20.4 20.4"/>',
  play: '<path d="M8.2 5.6v12.8L19 12z" fill="currentColor" stroke="none"/>',
  scale: '<path d="M12 4.2v15.6M7 19.8h10"/><path d="M6.6 7.6 4 13.2h5.2zM17.4 7.6 20 13.2h-5.2z"/><path d="M8.4 6.4h7.2"/>'
};

/** Build an inline SVG icon element. */
export function icon(name, { size = 18, cls = 'ico', stroke = 1.9 } = {}) {
  const path = ICONS[name] || ICONS.info;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', String(stroke));
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.innerHTML = path;
  return svg;
}

/** Fill every [data-icon] placeholder found under `root`. */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (el.dataset.iconDone) return;
    const size = Number(el.dataset.iconSize || 18);
    el.dataset.iconDone = '1';
    el.replaceChildren(icon(el.dataset.icon, { size, cls: el.dataset.iconClass || 'ico' }));
  });
}

/* ------------------------------- formatting ------------------------------ */
export const fmtInt = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-IN') : '—');
export const fmtPct = (n, dp = 1) => (Number.isFinite(n) ? `${(n * 100).toFixed(dp)}%` : '—');
export const fmtNum = (n, dp = 2) => (Number.isFinite(n) ? n.toFixed(dp) : '—');
export const fmtMs = (n) => (n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`);
export function fmtDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function fmtTime(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toLocaleTimeString('en-IN', { hour12: false });
}
export function truncate(s, n = 90) {
  const str = String(s ?? '');
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}
export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* --------------------------------- toasts -------------------------------- */
const TOAST_ICON = { ok: 'check', warn: 'alert', bad: 'close', info: 'info' };
export function toast(kind, title, message = '', timeout = 4200) {
  const host = qs('#toasts');
  if (!host) return;
  const el = h('div', { class: `toast ${kind}` },
    h('span', { class: 't-ico' }, icon(TOAST_ICON[kind] || 'info', { size: 14 })),
    h('div', {}, h('strong', { text: title }), message ? h('p', { text: message }) : null)
  );
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 260);
  }, timeout);
}

/* --------------------------------- drawer -------------------------------- */
let lastFocus = null;
export function openDrawer(title, builder) {
  const drawer = qs('#drawer');
  const body = qs('#drawerBody');
  qs('#drawerTitle').textContent = title;
  clear(body);
  const content = builder ? builder() : null;
  if (content) body.append(...[].concat(content));
  lastFocus = document.activeElement;
  drawer.hidden = false;
  document.body.classList.add('locked');
  qs('.drawer-panel', drawer).focus?.();
  const onKey = (e) => { if (e.key === 'Escape') closeDrawer(); };
  document.addEventListener('keydown', onKey, { once: true });
}

export function closeDrawer() {
  const drawer = qs('#drawer');
  if (drawer.hidden) return;
  drawer.hidden = true;
  document.body.classList.remove('locked');
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

export function initDrawer() {
  qsa('[data-close-drawer]').forEach((el) => el.addEventListener('click', closeDrawer));
}

/* ------------------------------- counters -------------------------------- */
export function countUp(el, value, { duration = 900, dp = 0, suffix = '', prefix = '' } = {}) {
  if (!el) return;
  const from = Number(el.dataset.value || 0);
  const to = Number(value) || 0;
  el.dataset.value = String(to);
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const v = from + (to - from) * eased;
    el.textContent = `${prefix}${dp ? v.toFixed(dp) : fmtInt(v)}${suffix}`;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* --------------------------- reveal on scroll ----------------------------- */
export function initReveal() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px' });
  qsa('.reveal').forEach((el) => obs.observe(el));
  return obs;
}

/* --------------------------------- pager --------------------------------- */
export function renderPager(host, { total, page, pageSize, onPage }) {
  clear(host);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const mk = (label, target, disabled = false, active = false) => h('button', {
    class: active ? 'active' : '', disabled, text: label,
    onclick: () => onPage(Math.min(pages, Math.max(1, target)))
  });
  host.append(
    h('span', { class: 'muted small', text: `${fmtInt(total)} rows · page ${page} / ${pages}` }),
    mk('‹', page - 1, page <= 1),
    (() => {
      const out = [];
      const from = Math.max(1, page - 2); const to = Math.min(pages, from + 4);
      for (let i = from; i <= to; i++) out.push(mk(String(i), i, false, i === page));
      return out;
    })(),
    mk('›', page + 1, page >= pages)
  );
}

/* -------------------------------- exports -------------------------------- */
export function downloadFile(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 400);
}

export function toCsv(rows, headers) {
  const cols = headers || Object.keys(rows[0] || {});
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

export function debounce(fn, wait = 220) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/** Accessible key-value block used in drawers and evidence packets. */
export function kv(pairs) {
  return h('dl', { class: 'dr-kv' },
    pairs.flatMap(([k, v]) => [
      h('dt', { text: k }),
      h('dd', { html: typeof v === 'string' && v.includes('<') ? v : escapeHtml(v ?? '—') })
    ])
  );
}

export function pill(text, cls = '') {
  return h('span', { class: `pill ${cls}`, text });
}
