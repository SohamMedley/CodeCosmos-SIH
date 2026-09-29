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
const ICONS = { ok: '✓', warn: '!', bad: '✕', info: 'i' };
export function toast(kind, title, message = '', timeout = 4200) {
  const host = qs('#toasts');
  if (!host) return;
  const el = h('div', { class: `toast ${kind}` },
    h('span', { class: 't-ico', text: ICONS[kind] || 'i' }),
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
