// Data-flow hero and scroll orb for sethshoultes.com (#149). Canvas 2D, no dependencies.
// Decoration only: every canvas is aria-hidden and the meaning lives in real HTML beside it.
//
//   <canvas class="flow-canvas" data-flow aria-hidden="true"></canvas>   business info -> site -> AI answers
//   <canvas class="orb-canvas"  data-orb  aria-hidden="true"></canvas>   orb assembles as you scroll
//
// Rules the scenes keep: fixed-size canvas (CSS aspect-ratio, so no layout shift); runs only
// while on screen and the tab is visible; prefers-reduced-motion gets one still frame; the
// device pixel ratio is capped; if frames run slow the particle count halves.

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t) => 1 - Math.pow(1 - t, 3);
const lerp = (a, b, t) => a + (b - a) * t;

function rng(seed) { // mulberry32: the same seed always paints the same still frame
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function colors() {
  const css = getComputedStyle(document.documentElement);
  const v = (name, fallback) => css.getPropertyValue(name).trim() || fallback;
  const rgb = (hex) => { const n = parseInt(hex.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  return { accent: rgb(v('--accent', '#ff6b2c')), surface: v('--surface', '#14171c'), surface2: v('--surface-2', '#1b1f26'), border: v('--border', '#262b33'), text: v('--text', '#f4f4f5'), muted: v('--muted', '#a1a7b0') };
}

function sprite(rgb, r) { // a soft glowing dot, drawn once and stamped many times
  const c = document.createElement('canvas');
  c.width = c.height = r * 2;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, `rgba(${rgb},1)`);
  gr.addColorStop(0.3, `rgba(${rgb},0.5)`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, r * 2, r * 2);
  return c;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Owns the canvas size, the loop and every reason to stop it. `make` builds a scene.
function run(cv, make) {
  const ctx = cv.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let w = 0, h = 0, onScreen = false, raf = 0, last = 0, ema = 1 / 60, slow = 0, quality = 1;
  const scene = make(ctx, cv, colors(), () => quality);

  const size = () => {
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return;
    w = r.width; h = r.height;
    const dpr = Math.min(window.devicePixelRatio || 1, w < 600 ? 1.5 : 2);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scene.resize(w, h, dpr);
    if (!raf) scene.frame(0, performance.now(), reduced.matches);
  };

  const tick = (now) => {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    ema = lerp(ema, dt, 0.05);
    slow = ema > 0.026 ? slow + dt : Math.max(0, slow - dt);
    if (slow > 1.5 && quality > 0.5) quality = 0.5;
    scene.frame(dt, now, false);
    if (onScreen && !document.hidden && !reduced.matches) raf = requestAnimationFrame(tick);
  };

  const sync = () => {
    const go = onScreen && !document.hidden && !reduced.matches;
    if (go && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    if (!go && raf) { cancelAnimationFrame(raf); raf = 0; }
    if (!go && w) scene.frame(0, performance.now(), reduced.matches);
  };

  new ResizeObserver(size).observe(cv);
  new IntersectionObserver((e) => { onScreen = e[0].isIntersecting; sync(); }, { rootMargin: '120px' }).observe(cv);
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  size();
  sync();
}

// ---- scene 1: business info flows into a site, then out to AI answers -------------------

const SOURCES = ['Services', 'Reviews', 'Pages'];
const ANSWERS = ['ChatGPT', 'Google AI', 'Perplexity'];

function flow(ctx, cv, c, getQuality) {
  const accent = c.accent.join(',');
  const dot = sprite(accent, 16);
  const spark = sprite('255,226,200', 16);
  const glow = sprite(accent, 64);
  const MAX = 270;
  const rand = rng(149);
  const ps = Array.from({ length: MAX }, (_, i) => ({ route: i % 6, t: rand(), sp: 0.16 + rand() * 0.12, seed: rand(), sz: 3 + rand() * 3 }));
  const back = document.createElement('canvas');
  let w = 0, h = 0, geo = null, inf = 0, infTarget = 0, mx = 0, my = 0, winPulse = 0;
  const cardPulse = [0, 0, 0];
  const ripples = [];

  const build = () => {
    const tall = w < h * 1.1;
    const src = [], cards = [], win = tall ? { x: w * 0.12, y: h * 0.34, w: w * 0.76, h: h * 0.3 } : { x: w * 0.38, y: h * 0.1, w: w * 0.24, h: h * 0.8 };
    for (let i = 0; i < 3; i++) {
      if (tall) {
        const cx = w * (0.2 + 0.3 * i), bw = w * 0.27, bh = h * 0.08;
        src.push({ x: cx - bw / 2, y: h * 0.06, w: bw, h: bh, label: SOURCES[i] });
        cards.push({ x: cx - bw / 2, y: h * 0.86, w: bw, h: bh * 1.2, label: ANSWERS[i] });
      } else {
        const cy = h * (0.2 + 0.3 * i), bh = h * 0.15;
        src.push({ x: w * 0.03, y: cy - bh / 2, w: w * 0.17, h: bh, label: SOURCES[i] });
        cards.push({ x: w * 0.78, y: cy - bh / 2, w: w * 0.19, h: bh * 1.1, label: ANSWERS[i] });
      }
    }
    const routes = [];
    const curve = (a, b) => {
      const d = tall ? [0, (b.y - a.y) * 0.5] : [(b.x - a.x) * 0.5, 0];
      return [a, { x: a.x + d[0], y: a.y + d[1] }, { x: b.x - d[0], y: b.y - d[1] }, b];
    };
    const slot = (i) => (tall ? { x: win.x + win.w * (0.25 + 0.25 * i), y: win.y } : { x: win.x, y: win.y + win.h * (0.25 + 0.25 * i) });
    const slotOut = (i) => (tall ? { x: win.x + win.w * (0.25 + 0.25 * i), y: win.y + win.h } : { x: win.x + win.w, y: win.y + win.h * (0.25 + 0.25 * i) });
    for (let i = 0; i < 3; i++) routes.push(curve(tall ? { x: src[i].x + src[i].w / 2, y: src[i].y + src[i].h } : { x: src[i].x + src[i].w, y: src[i].y + src[i].h / 2 }, slot(i)));
    for (let i = 0; i < 3; i++) routes.push(curve(slotOut(i), tall ? { x: cards[i].x + cards[i].w / 2, y: cards[i].y } : { x: cards[i].x, y: cards[i].y + cards[i].h / 2 }));
    geo = { tall, src, cards, win, routes };
  };

  const paintBack = (dpr) => {
    back.width = Math.round(w * dpr);
    back.height = Math.round(h * dpr);
    const g = back.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const fs = clamp(w * 0.017, 10, 14);
    g.font = `600 ${fs}px Inter, -apple-system, sans-serif`;
    g.textBaseline = 'middle';
    g.lineWidth = 1;
    g.strokeStyle = `rgba(${accent},0.16)`;
    for (const r of geo.routes) { g.beginPath(); g.moveTo(r[0].x, r[0].y); g.bezierCurveTo(r[1].x, r[1].y, r[2].x, r[2].y, r[3].x, r[3].y); g.stroke(); }
    const box = (b, label, align) => {
      roundRect(g, b.x, b.y, b.w, b.h, 10);
      g.fillStyle = c.surface; g.fill();
      g.strokeStyle = c.border; g.stroke();
      g.fillStyle = c.muted;
      g.textAlign = align;
      g.fillText(label, align === 'center' ? b.x + b.w / 2 : b.x + 14, b.y + b.h * 0.36);
      g.fillStyle = c.border;
      roundRect(g, b.x + 14, b.y + b.h * 0.62, b.w * 0.55, 4, 2); g.fill();
    };
    for (const s of geo.src) box(s, s.label, 'left');
    for (const a of geo.cards) box(a, a.label, 'left');
    const { x, y, w: ww, h: wh } = geo.win;
    roundRect(g, x, y, ww, wh, 14);
    g.fillStyle = c.surface2; g.fill();
    g.strokeStyle = c.border; g.stroke();
    g.fillStyle = c.border;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x + 16 + i * 14, y + 16, 4, 0, TAU); g.fill(); }
    g.fillStyle = `rgba(${accent},0.9)`;
    roundRect(g, x + 16, y + 38, ww * 0.42, 8, 4); g.fill();
    g.fillStyle = c.border;
    for (let i = 0; i < 6; i++) { roundRect(g, x + 16, y + 62 + i * 18, ww * (0.78 - (i % 3) * 0.14), 6, 3); g.fill(); }
  };

  const at = (r, t, p) => {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
    const wob = Math.sin(p.seed * TAU + t * 9) * h * 0.012 * Math.sin(Math.PI * t);
    return [a * r[0].x + b * r[1].x + d * r[2].x + e * r[3].x + (geo.tall ? wob : 0), a * r[0].y + b * r[1].y + d * r[2].y + e * r[3].y + (geo.tall ? 0 : wob)];
  };

  const pointer = (e) => { const r = cv.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; };
  cv.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { pointer(e); infTarget = 1; } });
  cv.addEventListener('pointerleave', () => { infTarget = 0; });
  cv.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') { pointer(e); ripples.push({ x: mx, y: my, age: 0 }); } });

  return {
    resize(nw, nh, dpr) { w = nw; h = nh; build(); paintBack(dpr); },
    frame(dt, now, still) {
      if (!geo) return;
      const m = Math.min(w, h);
      const live = Math.floor(MAX * getQuality() * (w < 600 ? 0.6 : 1));
      inf = lerp(inf, infTarget, 1 - Math.exp(-dt * 6));
      winPulse *= Math.exp(-dt * 3);
      for (let i = 0; i < 3; i++) cardPulse[i] *= Math.exp(-dt * 3);
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(back, 0, 0, w, h);
      const win = geo.win;
      if (winPulse > 0.01) { roundRect(ctx, win.x, win.y, win.w, win.h, 14); ctx.strokeStyle = `rgba(${accent},${winPulse * 0.7})`; ctx.lineWidth = 2; ctx.stroke(); }
      for (let i = 0; i < 3; i++) if (cardPulse[i] > 0.01) { const a = geo.cards[i]; roundRect(ctx, a.x, a.y, a.w, a.h, 10); ctx.strokeStyle = `rgba(${accent},${cardPulse[i] * 0.8})`; ctx.lineWidth = 2; ctx.stroke(); }
      for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].age += dt; if (ripples[i].age > 1.1) ripples.splice(i, 1); }
      ctx.globalCompositeOperation = 'lighter';
      const reach = m * 0.4;
      for (let i = 0; i < live; i++) {
        const p = ps[i];
        if (still) p.t = (i * 0.618) % 1;
        else {
          p.t += p.sp * dt;
          if (p.t >= 1) {
            p.t -= 1;
            if (p.route < 3) winPulse = Math.min(1, winPulse + 0.12); else cardPulse[p.route - 3] = Math.min(1, cardPulse[p.route - 3] + 0.25);
          }
        }
        let [x, y] = at(geo.routes[p.route], p.t, p);
        if (inf > 0.01) {
          const dx = mx - x, dy = my - y, d = Math.hypot(dx, dy);
          if (d < reach) { const k = inf * 0.62 * Math.pow(1 - d / reach, 2); x += dx * k; y += dy * k; }
        }
        for (const rp of ripples) {
          const dx = x - rp.x, dy = y - rp.y, d = Math.hypot(dx, dy) || 1, band = m * 0.07, off = d - rp.age * m * 0.45;
          if (Math.abs(off) < band) { const k = (1 - Math.abs(off) / band) * (1 - rp.age / 1.1) * 18; x += (dx / d) * k; y += (dy / d) * k; }
        }
        const r = p.sz * (0.7 + 0.3 * Math.sin(Math.PI * p.t)) * (m / 520 + 0.55);
        ctx.globalAlpha = Math.min(1, p.t * 7, (1 - p.t) * 7) * (p.route < 3 ? 0.9 : 0.8);
        ctx.drawImage(p.route < 3 ? dot : spark, x - r, y - r, r * 2, r * 2);
      }
      if (inf > 0.02) { ctx.globalAlpha = inf * 0.45; ctx.drawImage(glow, mx - reach * 0.5, my - reach * 0.5, reach, reach); }
      ctx.globalAlpha = 1;
      for (const rp of ripples) { ctx.beginPath(); ctx.arc(rp.x, rp.y, rp.age * m * 0.45, 0, TAU); ctx.strokeStyle = `rgba(${accent},${0.5 * (1 - rp.age / 1.1)})`; ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}

// ---- scene 2: scattered particles assemble into an orb as the section scrolls in --------

function orb(ctx, cv, c, getQuality) {
  const accent = c.accent.join(',');
  const dot = sprite(accent, 16);
  const core = sprite(accent, 64);
  const MAX = 520;
  const rand = rng(1491);
  const ps = Array.from({ length: MAX }, (_, i) => {
    const y = 1 - (i + 0.5) * (2 / MAX), rad = Math.sqrt(1 - y * y), th = i * 2.399963; // Fibonacci sphere
    return { ux: Math.cos(th) * rad, uy: y, uz: Math.sin(th) * rad, sx: (rand() - 0.5) * 3.4, sy: (rand() - 0.5) * 2.6, st: rand() * 0.4, seed: rand() * TAU, sz: 3 + rand() * 3 };
  });
  let w = 0, h = 0;

  return {
    resize(nw, nh) { w = nw; h = nh; },
    frame(dt, now, still) {
      const vh = window.innerHeight, top = cv.getBoundingClientRect().top;
      const p = still ? 1 : clamp((vh * 0.95 - top) / (vh * 0.6));
      const R = Math.min(w, h) * 0.3, cx = w / 2, cy = h / 2;
      const spin = still ? 0.6 : now * 0.00025;
      const cs = Math.cos(spin), sn = Math.sin(spin);
      const live = Math.floor(MAX * getQuality() * (w < 600 ? 0.65 : 1));
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      const e0 = ease(p);
      if (e0 > 0.02) { const s = R * (3.2 + (still ? 0 : Math.sin(now * 0.002) * 0.15)) * (0.4 + 0.6 * e0); ctx.globalAlpha = e0 * e0 * 0.55; ctx.drawImage(core, cx - s / 2, cy - s / 2, s, s); }
      for (let k = 0; k < live; k++) {
        const q = ps[Math.floor((k * MAX) / live)], e = ease(clamp((p - q.st) / 0.6));
        const x3 = q.ux * cs + q.uz * sn, z3 = -q.ux * sn + q.uz * cs, per = 1 / (1 - z3 * 0.25);
        const drift = still ? 0 : Math.sin(now * 0.001 + q.seed) * 0.05;
        const x = lerp(cx + (q.sx + drift) * R * 0.9, cx + x3 * R * per, e);
        const y = lerp(cy + (q.sy + drift) * R * 0.9, cy + q.uy * R * per, e);
        const depth = 0.5 + 0.5 * ((z3 + 1) / 2);
        const r = q.sz * lerp(1, depth * per, e) * (R / 150 + 0.5);
        ctx.globalAlpha = lerp(0.3, 0.35 + 0.65 * depth, e);
        ctx.drawImage(dot, x - r, y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (e0 > 0.4) { ctx.beginPath(); ctx.ellipse(cx, cy, R * 1.28, R * 0.4, -0.35, 0, TAU); ctx.strokeStyle = `rgba(${accent},${0.28 * e0})`; ctx.lineWidth = 1; ctx.stroke(); }
    },
  };
}

export function mountFlow(cv) { run(cv, flow); }
export function mountOrb(cv) { run(cv, orb); }

function start() {
  document.querySelectorAll('canvas[data-flow]').forEach(mountFlow);
  document.querySelectorAll('canvas[data-orb]').forEach(mountOrb);
}

// Content first: the scenes mount after the page has loaded, so LCP is unchanged.
const later = () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 200));
if (document.readyState === 'complete') later();
else addEventListener('load', later, { once: true });
