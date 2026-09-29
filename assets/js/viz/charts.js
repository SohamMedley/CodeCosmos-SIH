/**
 * Code Cosmos · Chart engine
 * ------------------------------------------------------------------
 * Dependency-free canvas charts with DPR-aware scaling, entry
 * animation, hover read-outs and resize handling. Every chart is
 * driven by real engine output — nothing is faked for the demo.
 */

const PALETTE = ['#0ea5e9', '#7c3aed', '#db2777', '#059669', '#d97706', '#2563eb', '#65a30d', '#e11d48', '#9333ea', '#0d9488', '#ea580c', '#0891b2'];
const PALETTE_DARK = ['#22d3ee', '#a855f7', '#f472b6', '#34d399', '#fbbf24', '#60a5fa', '#a3e635', '#fb7185', '#c084fc', '#2dd4bf', '#f59e0b', '#38bdf8'];

export function palette(i) {
  const light = document.documentElement.getAttribute('data-theme') !== 'dark';
  const set = light ? PALETTE : PALETTE_DARK;
  return set[i % set.length];
}

export function reducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function setup(canvas, cssHeight) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(220, rect.width || canvas.parentElement.clientWidth || 480);
  const h = cssHeight || rect.height || 220;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h, dpr };
}

function themeColors() {
  const light = document.documentElement.getAttribute('data-theme') !== 'dark';
  return {
    light,
    grid: light ? 'rgba(24,40,100,0.085)' : 'rgba(148,173,255,0.11)',
    axis: light ? 'rgba(24,40,100,0.22)' : 'rgba(148,173,255,0.26)',
    text: light ? '#6b7699' : '#8593b8',
    textStrong: light ? '#0e1734' : '#eaf0ff',
    font: getComputedStyle(document.body).fontFamily || 'sans-serif',
    mono: getComputedStyle(document.body).getPropertyValue('--mono').trim() || 'monospace'
  };
}

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

/**
 * Entry animation with a guaranteed landing frame: if requestAnimationFrame
 * is throttled or unavailable (headless capture, background tab, reduced
 * motion) the final state is still painted instead of an empty chart.
 */
function animate(canvas, duration, draw) {
  cancelAnimationFrame(canvas._raf);
  clearTimeout(canvas._rafFallback);
  if (reducedMotion() || typeof requestAnimationFrame !== 'function') { draw(1); return; }
  let landed = false;
  const start = performance.now();
  const finish = () => { if (!landed) { landed = true; draw(1); } };
  const run = (now) => {
    const t = Math.min(1, (now - start) / duration);
    draw(easeOutCubic(t));
    if (t < 1) canvas._raf = requestAnimationFrame(run);
    else landed = true;
  };
  canvas._raf = requestAnimationFrame(run);
  canvas._rafFallback = setTimeout(finish, duration + 160);
}

function attachHover(canvas, hitTest, tooltip) {
  if (canvas._hoverBound) return;
  canvas._hoverBound = true;
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  Object.assign(tip.style, {
    position: 'absolute', pointerEvents: 'none', padding: '7px 11px', borderRadius: '10px',
    background: 'rgba(8,12,26,0.94)', border: '1px solid rgba(148,173,255,0.3)', color: '#eaf0ff',
    fontSize: '12px', fontFamily: 'var(--mono)', whiteSpace: 'pre', opacity: '0', transition: 'opacity .15s',
    transform: 'translate(-50%, -120%)', zIndex: 5
  });
  const holder = canvas.parentElement;
  if (getComputedStyle(holder).position === 'static') holder.style.position = 'relative';
  holder.appendChild(tip);
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left; const y = e.clientY - rect.top;
    const hit = hitTest(x, y);
    if (!hit) { tip.style.opacity = '0'; return; }
    tip.textContent = tooltip(hit);
    tip.style.left = `${x}px`; tip.style.top = `${y}px`; tip.style.opacity = '1';
  });
  canvas.addEventListener('mouseleave', () => { tip.style.opacity = '0'; });
}

/* ============================== line chart ============================== */
/**
 * @param {HTMLCanvasElement} canvas
 * @param {{series:Array<{name:string,color:string,points:Array<{x:number,y:number}>}>, xLabel?:string, yLabel?:string, marker?:{x:number,label:string}, yMax?:number, xMin?:number, xMax?:number}} opts
 */
export function lineChart(canvas, opts) {
  const draw = () => {
    const { ctx, w, h } = setup(canvas, canvas.dataset.height ? Number(canvas.dataset.height) : 260);
    const T = themeColors();
    const pad = { l: 46, r: 16, t: 16, b: 34 };
    const plotW = w - pad.l - pad.r;
    const plotH = h - pad.t - pad.b;
    const series = opts.series || [];
    const xs = series.flatMap((s) => s.points.map((p) => p.x));
    const xMin = opts.xMin ?? Math.min(...xs);
    const xMax = opts.xMax ?? Math.max(...xs);
    const yMax = opts.yMax ?? 1;
    const X = (v) => pad.l + ((v - xMin) / (xMax - xMin || 1)) * plotW;
    const Y = (v) => pad.t + plotH - (v / yMax) * plotH;

    ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
    ctx.fillStyle = T.text; ctx.font = `11px ${T.mono}`;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const v = (yMax / gridLines) * i;
      const y = Math.round(Y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(v.toFixed(2), pad.l - 8, y);
    }
    const ticks = 6;
    for (let i = 0; i <= ticks; i++) {
      const v = xMin + ((xMax - xMin) / ticks) * i;
      const x = Math.round(X(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + plotH); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(v.toFixed(2), x, pad.t + plotH + 8);
    }
    ctx.strokeStyle = T.axis;
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + plotH); ctx.lineTo(w - pad.r, pad.t + plotH); ctx.stroke();

    if (opts.marker) {
      const mx = X(opts.marker.x);
      ctx.save();
      ctx.strokeStyle = 'rgba(251,191,36,0.85)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(mx, pad.t); ctx.lineTo(mx, pad.t + plotH); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = '#fbbf24'; ctx.font = `600 11px ${T.mono}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(opts.marker.label, Math.min(w - 46, Math.max(pad.l + 30, mx)), pad.t + 12);
    }

    animate(canvas, 850, (p) => {
      const { ctx: c } = setup(canvas, h);
      const g2 = themeColors();
      // grid is redrawn (cheap) to keep the frame self-contained
      c.strokeStyle = g2.grid;
      for (let i = 0; i <= gridLines; i++) {
        const y = Math.round(Y((yMax / gridLines) * i)) + 0.5;
        c.beginPath(); c.moveTo(pad.l, y); c.lineTo(w - pad.r, y); c.stroke();
      }
      c.strokeStyle = g2.axis;
      c.beginPath(); c.moveTo(pad.l, pad.t); c.lineTo(pad.l, pad.t + plotH); c.lineTo(w - pad.r, pad.t + plotH); c.stroke();
      c.fillStyle = g2.text; c.font = `11px ${g2.mono}`;
      for (let i = 0; i <= gridLines; i++) {
        const v = (yMax / gridLines) * i;
        c.textAlign = 'right'; c.textBaseline = 'middle';
        c.fillText(v.toFixed(2), pad.l - 8, Y(v));
      }
      for (let i = 0; i <= ticks; i++) {
        const v = xMin + ((xMax - xMin) / ticks) * i;
        c.textAlign = 'center'; c.textBaseline = 'top';
        c.fillText(v.toFixed(2), X(v), pad.t + plotH + 8);
      }
      if (opts.marker) {
        c.strokeStyle = 'rgba(251,191,36,0.85)'; c.lineWidth = 1.5; c.setLineDash([5, 4]);
        c.beginPath(); c.moveTo(X(opts.marker.x), pad.t); c.lineTo(X(opts.marker.x), pad.t + plotH); c.stroke();
        c.setLineDash([]);
      }

      series.forEach((s, si) => {
        const pts = s.points;
        if (!pts.length) return;
        const upto = Math.max(1, Math.floor(pts.length * p));
        // area
        c.beginPath();
        c.moveTo(X(pts[0].x), Y(0));
        for (let i = 0; i < upto; i++) c.lineTo(X(pts[i].x), Y(pts[i].y));
        c.lineTo(X(pts[upto - 1].x), Y(0));
        c.closePath();
        const grad = c.createLinearGradient(0, pad.t, 0, pad.t + plotH);
        grad.addColorStop(0, `${s.color}44`);
        grad.addColorStop(1, `${s.color}00`);
        c.fillStyle = grad; c.fill();
        // line
        c.beginPath();
        for (let i = 0; i < upto; i++) {
          const x = X(pts[i].x); const y = Y(pts[i].y);
          if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
        c.strokeStyle = s.color; c.lineWidth = 2.4; c.lineJoin = 'round';
        c.shadowColor = s.color; c.shadowBlur = 12;
        c.stroke();
        c.shadowBlur = 0;
        // last dot
        const last = pts[upto - 1];
        c.beginPath(); c.arc(X(last.x), Y(last.y), 4, 0, Math.PI * 2);
        c.fillStyle = s.color; c.fill();
        c.strokeStyle = T.light ? '#ffffff' : '#0b1020'; c.lineWidth = 2; c.stroke();
        void si;
      });
    });

    canvas._hitTest = (mx, my) => {
      let best = null;
      series.forEach((s) => s.points.forEach((pt) => {
        const d = Math.hypot(X(pt.x) - mx, Y(pt.y) - my);
        if (d < 16 && (!best || d < best.d)) best = { d, pt, s };
      }));
      return best;
    };
  };

  draw();
  bindResize(canvas, draw);
  attachHover(canvas, (x, y) => canvas._hitTest && canvas._hitTest(x, y),
    (hit) => `${hit.s.name}\n${opts.xLabel || 'threshold'} ${hit.pt.x.toFixed(2)} → ${hit.pt.y.toFixed(3)}`);
}

/* ============================== bar chart ============================== */
/**
 * @param {{items:Array<{label:string,value:number,color?:string}>, horizontal?:boolean, unit?:string, maxLabel?:number}} opts
 */
export function barChart(canvas, opts) {
  const draw = () => {
    const horizontal = opts.horizontal !== false;
    const items = (opts.items || []).slice(0, 18);
    const height = horizontal ? Math.max(160, items.length * 34 + 16) : 240;
    const { ctx, w, h } = setup(canvas, canvas.dataset.height ? Number(canvas.dataset.height) : height);
    const T = themeColors();
    const max = Math.max(...items.map((i) => i.value), 1);

    if (horizontal) {
      const labelW = Math.min(190, Math.max(110, w * 0.42));
      const barMax = w - labelW - 60;
      items.forEach((it, idx) => {
        const y = 8 + idx * 34;
        ctx.fillStyle = T.text; ctx.font = `11.5px ${T.font}`;
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        const label = it.label.length > 30 ? `${it.label.slice(0, 29)}…` : it.label;
        ctx.fillText(label, labelW - 10, y + 11);
        ctx.fillStyle = T.grid;
        roundRect(ctx, labelW, y + 3, barMax, 17, 8); ctx.fill();
        const bw = Math.max(3, (it.value / max) * barMax);
        const col = it.color || palette(idx);
        ctx.fillStyle = T.light ? 'rgba(24,40,100,0.055)' : 'rgba(148,173,255,0.08)';
        roundRect(ctx, labelW, y + 3, barMax, 17, 8); ctx.fill();
        const g = ctx.createLinearGradient(labelW, 0, labelW + bw, 0);
        g.addColorStop(0, col); g.addColorStop(1, `${col}88`);
        ctx.fillStyle = g;
        roundRect(ctx, labelW, y + 3, bw, 17, 8); ctx.fill();
        ctx.fillStyle = T.textStrong; ctx.textAlign = 'left';
        ctx.font = `600 11px ${T.mono}`;
        ctx.fillText(fmtNum(it.value), labelW + bw + 8, y + 12);
      });
    } else {
      const pad = { l: 40, r: 12, t: 14, b: 38 };
      const plotW = w - pad.l - pad.r; const plotH = h - pad.t - pad.b;
      const bw = plotW / Math.max(1, items.length);

      const frame = (p, gvals) => {
        const { ctx: c } = setup(canvas, h);
        const th = themeColors();
        c.strokeStyle = th.grid; c.lineWidth = 1;
        c.fillStyle = th.text; c.font = `10.5px ${th.mono}`;
        for (let i = 0; i <= 4; i++) {
          const v = (gvals.max / 4) * i;
          const y = Math.round(pad.t + plotH - (v / gvals.max) * plotH) + 0.5;
          c.beginPath(); c.moveTo(pad.l, y); c.lineTo(w - pad.r, y); c.stroke();
          c.textAlign = 'right'; c.textBaseline = 'middle';
          c.fillText(fmtNum(v), pad.l - 7, y);
        }
        c.strokeStyle = th.axis;
        c.beginPath(); c.moveTo(pad.l, pad.t); c.lineTo(pad.l, pad.t + plotH); c.lineTo(w - pad.r, pad.t + plotH); c.stroke();

        const fill = ring => items.forEach((it, idx) => {
          const target = (it.value / gvals.max) * plotH;
          const bh = Math.max(0, target * p);
          const x = pad.l + idx * bw + bw * 0.18;
          const bwid = bw * 0.64;
          const color = it.color || palette(idx);
          c.fillStyle = th.light ? 'rgba(24,40,100,0.05)' : 'rgba(148,173,255,0.07)';
          roundRect(c, x, pad.t + plotH - target, bwid, target, 7); c.fill();
          const g = c.createLinearGradient(0, pad.t + plotH - bh, 0, pad.t + plotH);
          g.addColorStop(0, color); g.addColorStop(1, `${color}99`);
          c.fillStyle = g;
          roundRect(c, x, pad.t + plotH - bh, bwid, bh, 7); c.fill();
          if (ring) {
            c.strokeStyle = th.light ? 'rgba(255,255,255,0.9)' : 'rgba(10,14,28,0.75)';
            c.lineWidth = 1.4; c.stroke();
          }
          c.fillStyle = th.text; c.font = `10px ${th.mono}`;
          c.textAlign = 'center'; c.textBaseline = 'top';
          const lbl = it.label.length > 11 ? `${it.label.slice(0, 10)}…` : it.label;
          c.fillText(lbl, x + bwid / 2, pad.t + plotH + 8);
        });

        const base = () => {
          c.strokeStyle = th.grid;
          for (let i = 0; i <= 4; i++) {
            const y = Math.round(pad.t + plotH - ((gvals.max / 4) * i / gvals.max) * plotH) + 0.5;
            c.beginPath(); c.moveTo(pad.l, y); c.lineTo(w - pad.r, y); c.stroke();
          }
          c.strokeStyle = th.axis;
          c.beginPath(); c.moveTo(pad.l, pad.t); c.lineTo(pad.l, pad.t + plotH); c.lineTo(w - pad.r, pad.t + plotH); c.stroke();
        };
        return { base, fill, th };
      };

      void frame;
      const max = Math.max(...items.map((i) => i.value), 1);
      const ctxRef = setup(canvas, h).ctx;
      void ctxRef;
      const state = { max };
      animate(canvas, 760, (p) => {
        const { ctx: c } = setup(canvas, h);
        const th = themeColors();
        c.strokeStyle = th.grid; c.lineWidth = 1;
        c.fillStyle = th.text; c.font = `10.5px ${th.mono}`;
        for (let i = 0; i <= 4; i++) {
          const v = (state.max / 4) * i;
          const y = Math.round(pad.t + plotH - (v / state.max) * plotH) + 0.5;
          c.beginPath(); c.moveTo(pad.l, y); c.lineTo(w - pad.r, y); c.stroke();
          c.textAlign = 'right'; c.textBaseline = 'middle';
          c.fillText(fmtNum(v), pad.l - 7, y);
        }
        c.strokeStyle = th.axis;
        c.beginPath(); c.moveTo(pad.l, pad.t); c.lineTo(pad.l, pad.t + plotH); c.lineTo(w - pad.r, pad.t + plotH); c.stroke();
        items.forEach((it, idx) => {
          const target = (it.value / state.max) * plotH;
          const bh = Math.max(0, target * p);
          const x = pad.l + idx * bw + bw * 0.18;
          const bwid = bw * 0.64;
          const color = it.color || palette(idx);
          c.fillStyle = th.light ? 'rgba(24,40,100,0.05)' : 'rgba(148,173,255,0.07)';
          roundRect(c, x, pad.t + plotH - target, bwid, target, 7); c.fill();
          const g = c.createLinearGradient(0, pad.t + plotH - bh, 0, pad.t + plotH);
          g.addColorStop(0, color); g.addColorStop(1, `${color}99`);
          c.fillStyle = g;
          roundRect(c, x, pad.t + plotH - bh, bwid, bh, 7); c.fill();
          c.fillStyle = th.text; c.font = `10px ${th.mono}`;
          c.textAlign = 'center'; c.textBaseline = 'top';
          const lbl = it.label.length > 11 ? `${it.label.slice(0, 10)}…` : it.label;
          c.fillText(lbl, x + bwid / 2, pad.t + plotH + 8);
        });
      });
    }

    canvas._items = items;
    canvas._geometry = { horizontal, w, h };
  };
  draw();
  bindResize(canvas, draw);
  attachHover(canvas, (x, y) => {
    const g = canvas._geometry;
    if (!g) return null;
    if (g.horizontal) {
      const idx = Math.floor((y - 8) / 34);
      const it = canvas._items[idx];
      return it ? { it, x, y } : null;
    }
    const pad = { l: 34, r: 10 };
    const bw = (g.w - pad.l - pad.r) / canvas._items.length;
    const idx = Math.floor((x - pad.l) / bw);
    const it = canvas._items[idx];
    return it ? { it, x, y } : null;
  }, (hit) => `${hit.it.label}\n${fmtNum(hit.it.value)}${opts.unit ? ` ${opts.unit}` : ''}`);
}

/* ============================= histogram ============================= */
export function histogramChart(canvas, opts) {
  const items = (opts.bins || []).map((b, i) => ({
    label: `${fmtNum(b.bin[0], 2)}–${fmtNum(b.bin[1], 2)}`,
    value: b.count,
    color: opts.colors ? opts.colors[i] : null
  }));
  barChart(canvas, { items, horizontal: false });
}

/* ============================= scatter ============================= */
/**
 * @param {{points:Array<{x:number,y:number,label?:string,color?:string,group?:string,r?:number}>, onClick?:Function, legend?:boolean}} opts
 */
export function scatterChart(canvas, opts) {
  const draw = () => {
    const { ctx, w, h } = setup(canvas, canvas.dataset.height ? Number(canvas.dataset.height) : 330);
    const T = themeColors();
    const pad = 26;
    const plotW = w - pad * 2; const plotH = h - pad * 2;
    ctx.strokeStyle = T.grid;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(pad + (plotW / 4) * i, pad); ctx.lineTo(pad + (plotW / 4) * i, pad + plotH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad, pad + (plotH / 4) * i); ctx.lineTo(pad + plotW, pad + (plotH / 4) * i); ctx.stroke();
    }
    ctx.strokeStyle = T.axis; ctx.strokeRect(pad, pad, plotW, plotH);

    const pts = opts.points || [];
    const sx = (v) => pad + ((v + 1.15) / 2.3) * plotW;
    const sy = (v) => pad + plotH - ((v + 1.15) / 2.3) * plotH;

    animate(canvas, 900, (p) => {
      const { ctx: c } = setup(canvas, h);
      const th = themeColors();
      c.strokeStyle = th.grid;
      for (let i = 0; i <= 4; i++) {
        c.beginPath(); c.moveTo(pad + (plotW / 4) * i, pad); c.lineTo(pad + (plotW / 4) * i, pad + plotH); c.stroke();
        c.beginPath(); c.moveTo(pad, pad + (plotH / 4) * i); c.lineTo(pad + plotW, pad + (plotH / 4) * i); c.stroke();
      }
      c.fillStyle = th.light ? 'rgba(24,40,100,0.035)' : 'rgba(148,173,255,0.05)';
      roundRect(c, pad, pad, plotW, plotH, 14); c.fill();
      c.strokeStyle = th.axis; roundRect(c, pad, pad, plotW, plotH, 14); c.stroke();

      const n = Math.ceil(pts.length * p);
      for (let i = 0; i < n; i++) {
        const pt = pts[i];
        const x = sx(pt.x); const y = sy(pt.y);
        const col = pt.color || palette(0);
        const r = (pt.r || 3.6) * (0.55 + 0.45 * p);
        if (pt.highlight) {
          c.beginPath(); c.arc(x, y, r + 4.5, 0, Math.PI * 2);
          c.fillStyle = `${col}22`; c.fill();
        }
        c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
        c.fillStyle = `${col}${th.light ? 'e6' : 'cc'}`; c.fill();
        if (pt.highlight) {
          c.strokeStyle = th.light ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.85)';
          c.lineWidth = 1.5; c.stroke();
        }
      }
      canvas._pts = pts; canvas._proj = { sx, sy };
    });

    canvas._hitTest = (mx, my) => {
      let best = null;
      pts.forEach((pt) => {
        const d = Math.hypot(canvas._proj.sx(pt.x) - mx, canvas._proj.sy(pt.y) - my);
        if (d < 11 && (!best || d < best.d)) best = { d, pt };
      });
      return best;
    };
  };
  draw();
  bindResize(canvas, draw);
  attachHover(canvas, (x, y) => canvas._hitTest(x, y),
    (hit) => `${hit.pt.label ? `${hit.pt.label}\n` : ''}${hit.pt.group || ''}`);
  canvas.addEventListener('click', (e) => {
    if (!opts.onClick) return;
    const rect = canvas.getBoundingClientRect();
    const hit = canvas._hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (hit) opts.onClick(hit.pt);
  });
}

/* ============================ grouped bars ============================ */
export function groupedBarChart(canvas, opts) {
  const draw = () => {
    const { ctx, w, h } = setup(canvas, canvas.dataset.height ? Number(canvas.dataset.height) : 220);
    const T = themeColors();
    const groups = opts.groups || [];
    const series = opts.series || [];
    const pad = { l: 46, r: 16, t: 16, b: 40 };
    const plotW = w - pad.l - pad.r; const plotH = h - pad.t - pad.b;
    const max = Math.max(...groups.flatMap((g) => series.map((s) => g[s.key] || 0)), 1);
    ctx.strokeStyle = T.grid;
    ctx.fillStyle = T.text; ctx.font = `10.5px ${T.mono}`;
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i;
      const y = pad.t + plotH - (v / max) * plotH;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(fmtNum(v), pad.l - 7, y);
    }
    const gw = plotW / groups.length;
    groups.forEach((g, gi) => {
      const bw = (gw * 0.7) / series.length;
      series.forEach((s, si) => {
        const v = g[s.key] || 0;
        const bh = (v / max) * plotH;
        const x = pad.l + gi * gw + gw * 0.15 + si * bw;
        const col = s.color || palette(si);
        const grad = ctx.createLinearGradient(0, pad.t + plotH - bh, 0, pad.t + plotH);
        grad.addColorStop(0, col); grad.addColorStop(1, `${col}44`);
        ctx.fillStyle = grad;
        roundRect(ctx, x + 2, pad.t + plotH - bh, Math.max(2, bw - 4), bh, 5); ctx.fill();
      });
      ctx.fillStyle = T.text; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.font = `11px ${T.font}`;
      ctx.fillText(g.label, pad.l + gi * gw + gw / 2, pad.t + plotH + 10);
    });
    ctx.strokeStyle = T.axis;
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, pad.t + plotH); ctx.lineTo(w - pad.r, pad.t + plotH); ctx.stroke();
    canvas._groups = groups; canvas._series = series; canvas._geo = { pad, plotW, plotH, max };
  };
  draw();
  bindResize(canvas, draw);
}

/* ============================== helpers ============================== */
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function fmtNum(v, dp) {
  if (!Number.isFinite(v)) return '—';
  if (dp !== undefined) return v.toFixed(dp);
  if (Math.abs(v) >= 1000) return `${Math.round(v / 100) / 10}k`;
  if (Math.abs(v) >= 10) return String(Math.round(v));
  return String(Math.round(v * 1000) / 1000);
}

function bindResize(canvas, draw) {
  canvas._redraw = draw;                       // lets redrawAll() re-render on theme change
  if (canvas._resizeBound) return;
  canvas._resizeBound = true;
  let timer = null;
  const ro = new ResizeObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(draw, 130);
  });
  ro.observe(canvas.parentElement);
}

export function redrawAll(root = document) {
  root.querySelectorAll('canvas').forEach((c) => {
    if (typeof c._redraw === 'function') c._redraw();
  });
}

/** Charts re-render on theme change so colours stay legible. */
export function watchTheme(redraw) {
  const mo = new MutationObserver(redraw);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return mo;
}
