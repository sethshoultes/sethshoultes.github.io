// Hero animations for sethshoultes.com (#149, #152): one canvas 2D engine, six scenes.
// Decoration only: every canvas is aria-hidden and the meaning lives in real HTML beside it.
//
//   <canvas data-anim="flow|orb|answer|blocks|pins|page" aria-hidden="true"></canvas>
//   (use _includes/hero-anim.html, which adds the figure, the stylesheet and this script)
//
//   flow     business info streams into a site window and out to AI answer cards (full-bleed or boxed)
//   orb      particles assemble into an orb as the section scrolls in
//   answer   a question flows into an AI answer card that cites the site   (AI search optimization)
//   blocks   blocks drop in and assemble a page                              (WordPress development)
//   pins     map pins land and our listing climbs the ranking                (SEO)
//   page     a wireframe page builds itself and scores 100                   (web development)
//
// Rules every scene keeps: fixed-size canvas (CSS aspect-ratio, so no layout shift); runs only
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
  const copy = cv.parentElement.querySelector('.flow-copy');
  if (copy) new ResizeObserver(size).observe(copy); // the scene sits below the headline, so re-lay it when the text re-wraps
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
    const tall = w < 700 && w < h * 1.3 || w < h * 0.9;
    // The scene fills the lower part of a full-bleed canvas; the headline sits over the top.
    const copy = cv.parentElement.querySelector('.flow-copy');
    const top = copy ? copy.getBoundingClientRect().bottom - cv.getBoundingClientRect().top + h * 0.04 : h * 0.04;
    const ay = Math.min(top, h * 0.78);
    const A = { x: w * 0.04, y: ay, w: w * 0.92, h: h * 0.96 - ay };
    const X = (f) => A.x + A.w * f, Y = (f) => A.y + A.h * f;
    const src = [], cards = [];
    const win = tall ? { x: X(0.08), y: Y(0.38), w: A.w * 0.84, h: A.h * 0.24 } : { x: X(0.37), y: Y(0), w: A.w * 0.26, h: A.h };
    for (let i = 0; i < 3; i++) {
      if (tall) {
        const cx = X(0.2 + 0.3 * i), bw = A.w * 0.27, bh = A.h * 0.16;
        src.push({ x: cx - bw / 2, y: A.y, w: bw, h: bh, label: SOURCES[i] });
        cards.push({ x: cx - bw / 2, y: A.y + A.h - bh * 1.2, w: bw, h: bh * 1.2, label: ANSWERS[i] });
      } else {
        const cy = Y(0.17 + 0.33 * i), bh = A.h * 0.22;
        src.push({ x: A.x, y: cy - bh / 2, w: A.w * 0.19, h: bh, label: SOURCES[i] });
        cards.push({ x: A.x + A.w * 0.79, y: cy - bh / 2, w: A.w * 0.21, h: bh * 1.1, label: ANSWERS[i] });
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

  const rel = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, r]; };
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const [x, y, r] = rel(e);
    infTarget = x >= 0 && y >= 0 && x <= r.width && y <= r.height ? 1 : 0;
    mx = x; my = y;
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { infTarget = 0; });
  addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    const [x, y, r] = rel(e);
    if (x >= 0 && y >= 0 && x <= r.width && y <= r.height) ripples.push({ x, y, age: 0 });
  }, { passive: true });

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
      const wide = w > 860, R = Math.min(w * (wide ? 0.3 : 0.42), h * 0.4), cx = wide ? w * 0.62 : w / 2, cy = h * 0.5;
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


// ---- timeline scenes: drawn in a fixed 560x420 box scaled to the canvas ------------------

const VW = 560, VH = 420;
const seg = (t, a, b) => ease(clamp((t - a) / (b - a)));          // 0..1 eased progress of t between a and b
const back = (x) => { const k = 1.7; return 1 + (k + 1) * Math.pow(x - 1, 3) + k * Math.pow(x - 1, 2); }; // overshoot

function timeline(period, still, draw) {
  return (ctx, w, h, c, now) => {
    const k = Math.min(w / VW, h / VH);
    const t = still ? period * 0.82 : (now / 1000) % period;
    const fade = still ? 1 : Math.min(1, (period - t) / 0.5, t / 0.35 + 0.15);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate((w - VW * k) / 2, (h - VH * k) / 2);
    ctx.scale(k, k);
    ctx.globalAlpha = fade;
    draw(ctx, t, c);
    ctx.restore();
  };
}

function panel(g, x, y, w, h, c, r = 12, fill) {
  roundRect(g, x, y, w, h, r);
  g.fillStyle = fill || c.surface; g.fill();
  g.strokeStyle = c.border; g.lineWidth = 1; g.stroke();
}
function bar(g, x, y, w, h, fill, p = 1) {
  if (p <= 0) return;
  roundRect(g, x, y, Math.max(h, w * p), h, h / 2);
  g.fillStyle = fill; g.fill();
}
function dots(g, x, y, c) { g.fillStyle = c.border; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(x + i * 13, y, 4, 0, TAU); g.fill(); } }
function label(g, text, x, y, color, size = 13, weight = 600, align = 'left') {
  g.font = `${weight} ${size}px Inter, -apple-system, sans-serif`;
  g.fillStyle = color; g.textAlign = align; g.textBaseline = 'middle';
  g.fillText(text, x, y);
}

// answer: a question flows into an AI answer card that cites the site
function answer(ctx, cv, c, getQuality) {
  const A = c.accent.join(','), acc = `rgb(${A})`;
  const dot = sprite(A, 12);
  let w = 0, h = 0, still = false;
  const rand = rng(152);
  const pts = Array.from({ length: 34 }, () => ({ o: rand(), j: rand() - 0.5 }));
  const draw = (g, t, col) => {
    const q = { x: 14, y: 34, w: 214, h: 46 }, card = { x: 262, y: 60, w: 284, h: 262 }, site = { x: 14, y: 236, w: 190, h: 150 };
    const cite = { x: card.x + 18, y: card.y + card.h - 54, w: 142, h: 32 };
    // the question
    const qGlow = seg(t, 0, 0.5) * (1 - seg(t, 1.6, 2.2));
    panel(g, q.x, q.y, q.w, q.h, col, 23); if (qGlow > 0.01) { roundRect(g, q.x, q.y, q.w, q.h, 23); g.strokeStyle = `rgba(${A},${qGlow * 0.8})`; g.lineWidth = 1.5; g.stroke(); }
    label(g, 'Best plumber near me?', q.x + 20, q.y + q.h / 2, col.text, 13.5);
    // the AI answer card
    panel(g, card.x, card.y, card.w, card.h, col, 16, col.surface2);
    g.fillStyle = acc; g.beginPath(); g.arc(card.x + 24, card.y + 26, 7, 0, TAU); g.fill();
    label(g, 'AI answer', card.x + 40, card.y + 26, col.muted, 12.5);
    const lines = [0.92, 0.78, 0.86, 0.6];
    lines.forEach((f, i) => bar(g, card.x + 20, card.y + 58 + i * 30, (card.w - 40) * f, 9, col.border, seg(t, 1.5 + i * 0.7, 2.3 + i * 0.7)));
    // the citation chip
    const cp = seg(t, 4.5, 5.2);
    if (cp > 0) {
      g.save(); g.globalAlpha *= cp;
      roundRect(g, cite.x, cite.y + (1 - cp) * 8, cite.w, cite.h, 16); g.fillStyle = `rgba(${A},0.14)`; g.fill(); g.strokeStyle = `rgba(${A},0.7)`; g.stroke();
      label(g, '[1] yoursite.com', cite.x + 14, cite.y + 16 + (1 - cp) * 8, acc, 12.5);
      g.restore();
    }
    // the site being cited
    const sp = seg(t, 5.0, 5.8);
    panel(g, site.x, site.y, site.w, site.h, col, 12); dots(g, site.x + 16, site.y + 16, col);
    bar(g, site.x + 16, site.y + 38, site.w * 0.4, 8, acc);
    for (let i = 0; i < 4; i++) bar(g, site.x + 16, site.y + 62 + i * 18, site.w * (0.76 - (i % 3) * 0.14), 6, col.border);
    if (sp > 0.01) { roundRect(g, site.x, site.y, site.w, site.h, 12); g.strokeStyle = `rgba(${A},${sp * 0.8})`; g.lineWidth = 2; g.stroke(); }
    // links: question -> card, site -> citation
    const a = { x: q.x + q.w, y: q.y + q.h / 2 }, b = { x: card.x, y: card.y + 56 };
    g.strokeStyle = `rgba(${A},0.18)`; g.lineWidth = 1; g.beginPath(); g.moveTo(a.x, a.y); g.bezierCurveTo(a.x + 30, a.y, b.x - 30, b.y, b.x, b.y); g.stroke();
    const c2 = { x: site.x + site.w, y: site.y + 50 }, d2 = { x: cite.x, y: cite.y + cite.h / 2 };
    if (sp > 0.01) { g.setLineDash([4, 5]); g.strokeStyle = `rgba(${A},${0.6 * sp})`; g.beginPath(); g.moveTo(c2.x, c2.y); g.bezierCurveTo(c2.x + 40, c2.y, d2.x - 40, d2.y, d2.x, d2.y); g.stroke(); g.setLineDash([]); }
    // particles
    g.globalCompositeOperation = 'lighter';
    const n = Math.floor(pts.length * getQuality());
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const f1 = clamp((t - 0.2 - p.o * 1.4) / 0.9);
      if (f1 > 0 && f1 < 1) {
        const u = ease(f1), x = lerp(a.x, b.x, u), y = lerp(a.y, b.y, u) + Math.sin(u * Math.PI) * p.j * 30;
        g.globalAlpha = Math.sin(f1 * Math.PI); g.drawImage(dot, x - 8, y - 8, 16, 16);
      }
      const f2 = clamp((t - 5.2 - p.o * 0.9) / 0.8);
      if (f2 > 0 && f2 < 1) {
        const u = ease(f2), x = lerp(c2.x, d2.x, u), y = lerp(c2.y, d2.y, u) + Math.sin(u * Math.PI) * p.j * 24;
        g.globalAlpha = Math.sin(f2 * Math.PI); g.drawImage(dot, x - 8, y - 8, 16, 16);
      }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  };
  const paint = timeline(8, false, draw), paintStill = timeline(8, true, draw);
  return { resize(nw, nh) { w = nw; h = nh; }, frame(dt, now, st) { (st ? paintStill : paint)(ctx, w, h, c, now); } };
}

// blocks: blocks drop in and assemble a page
function blocks(ctx, cv, c) {
  const A = c.accent.join(','), acc = `rgb(${A})`;
  let w = 0, h = 0;
  const F = { x: 100, y: 16, w: 360, h: 388 };
  // [x, y, w, h, kind] inside the page frame
  const B = [
    [16, 40, 328, 28, 'nav'], [16, 80, 328, 104, 'hero'], [16, 196, 328, 14, 'title'],
    [16, 222, 100, 78, 'card'], [130, 222, 100, 78, 'card'], [244, 222, 100, 78, 'card'],
    [16, 312, 328, 10, 'line'], [16, 330, 250, 10, 'line'], [16, 354, 328, 22, 'foot'],
  ];
  const drawBlock = (g, b, col) => {
    const [x, y, bw, bh, k] = b;
    if (k === 'nav') { roundRect(g, x, y, bw, bh, 8); g.fillStyle = col.surface2; g.fill(); bar(g, x + 12, y + 10, 54, 8, acc); for (let i = 0; i < 3; i++) bar(g, x + bw - 130 + i * 44, y + 11, 34, 6, col.border); }
    else if (k === 'hero') { roundRect(g, x, y, bw, bh, 10); const gr = g.createLinearGradient(x, y, x + bw, y + bh); gr.addColorStop(0, `rgba(${A},0.55)`); gr.addColorStop(1, `rgba(${A},0.08)`); g.fillStyle = gr; g.fill(); bar(g, x + 20, y + 28, 190, 12, col.text); bar(g, x + 20, y + 52, 130, 8, col.muted); bar(g, x + 20, y + 74, 70, 16, acc); }
    else if (k === 'title') bar(g, x, y, 150, bh, col.text);
    else if (k === 'card') { roundRect(g, x, y, bw, bh, 10); g.fillStyle = col.surface2; g.fill(); g.strokeStyle = col.border; g.stroke(); g.fillStyle = `rgba(${A},0.7)`; g.beginPath(); g.arc(x + 18, y + 20, 8, 0, TAU); g.fill(); bar(g, x + 14, y + 42, bw - 28, 6, col.border); bar(g, x + 14, y + 56, bw - 52, 6, col.border); }
    else if (k === 'line') bar(g, x, y, bw, bh, col.border);
    else { roundRect(g, x, y, bw, bh, 8); g.fillStyle = col.surface2; g.fill(); bar(g, x + 12, y + 8, 90, 6, col.border); }
  };
  const draw = (g, t, col) => {
    panel(g, F.x, F.y, F.w, F.h, col, 16); dots(g, F.x + 18, F.y + 18, col);
    g.save(); g.translate(F.x, F.y);
    let active = null;
    B.forEach((b, i) => {
      const t0 = 0.3 + i * 0.42, p = clamp((t - t0) / 0.55);
      if (p <= 0) return;
      const drop = 1 - back(p);
      g.save();
      g.globalAlpha *= Math.min(1, p * 2.5);
      g.translate(0, -drop * 70);
      drawBlock(g, b, col);
      g.restore();
      if (p < 1) active = b;
      else if (clamp((t - t0 - 0.55) / 0.35) < 1) { g.save(); g.globalAlpha *= 1 - seg(t, t0 + 0.55, t0 + 0.9); roundRect(g, b[0] - 3, b[1] - 3, b[2] + 6, b[3] + 6, 11); g.strokeStyle = acc; g.lineWidth = 1.5; g.stroke(); g.restore(); }
    });
    if (active) { g.setLineDash([5, 4]); roundRect(g, active[0] - 3, active[1] - 3, active[2] + 6, active[3] + 6, 11); g.strokeStyle = `rgba(${A},0.5)`; g.lineWidth = 1; g.stroke(); g.setLineDash([]); }
    g.restore();
    // the block inserter badge
    const bp = seg(t, 0, 0.4);
    g.save(); g.globalAlpha *= bp;
    g.fillStyle = acc; g.beginPath(); g.arc(F.x - 34, F.y + 30, 17, 0, TAU); g.fill();
    g.strokeStyle = '#0b0d10'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(F.x - 34, F.y + 22); g.lineTo(F.x - 34, F.y + 38); g.moveTo(F.x - 42, F.y + 30); g.lineTo(F.x - 26, F.y + 30); g.stroke();
    g.restore();
  };
  const paint = timeline(7.5, false, draw), paintStill = timeline(7.5, true, draw);
  return { resize(nw, nh) { w = nw; h = nh; }, frame(dt, now, st) { (st ? paintStill : paint)(ctx, w, h, c, now); } };
}

// pins: map pins land and our listing climbs the ranking
function pins(ctx, cv, c) {
  const A = c.accent.join(','), acc = `rgb(${A})`;
  let w = 0, h = 0;
  const M = { x: 14, y: 16, w: 336, h: 388 };
  const P = [[70, 90], [250, 70], [160, 170], [290, 220], [90, 280], [230, 330], [120, 360]];
  const home = [196, 214];
  const pin = (g, x, y, s, fill) => { g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x - 11 * s, y - 14 * s, x - 11 * s, y - 32 * s, x, y - 32 * s); g.bezierCurveTo(x + 11 * s, y - 32 * s, x + 11 * s, y - 14 * s, x, y); g.fillStyle = fill; g.fill(); g.fillStyle = '#0b0d10'; g.beginPath(); g.arc(x, y - 21 * s, 4 * s, 0, TAU); g.fill(); };
  const draw = (g, t, col) => {
    panel(g, M.x, M.y, M.w, M.h, col, 16, col.surface2);
    g.save(); roundRect(g, M.x, M.y, M.w, M.h, 16); g.clip();
    g.strokeStyle = col.border; g.lineWidth = 1;
    for (let x = 30; x < M.w; x += 56) { g.beginPath(); g.moveTo(M.x + x, M.y); g.lineTo(M.x + x + 18, M.y + M.h); g.stroke(); }
    for (let y = 40; y < M.h; y += 62) { g.beginPath(); g.moveTo(M.x, M.y + y); g.lineTo(M.x + M.w, M.y + y - 14); g.stroke(); }
    g.lineWidth = 6; g.strokeStyle = col.surface; g.beginPath(); g.moveTo(M.x, M.y + 230); g.bezierCurveTo(M.x + 110, M.y + 150, M.x + 220, M.y + 290, M.x + M.w, M.y + 170); g.stroke();
    P.forEach(([x, y], i) => {
      const p = clamp((t - 0.3 - i * 0.25) / 0.5); if (p <= 0) return;
      const d = (1 - back(p)) * 60;
      g.save(); g.globalAlpha *= Math.min(1, p * 3); pin(g, M.x + x, M.y + y - d, 0.9, col.muted); g.restore();
    });
    const hp = clamp((t - 2.4) / 0.6);
    if (hp > 0) {
      const pulse = (t * 0.9) % 1;
      g.strokeStyle = `rgba(${A},${(1 - pulse) * 0.6 * hp})`; g.lineWidth = 2; g.beginPath(); g.arc(M.x + home[0], M.y + home[1], 10 + pulse * 40, 0, TAU); g.stroke();
      g.fillStyle = `rgba(${A},${0.15 * hp})`; g.beginPath(); g.arc(M.x + home[0], M.y + home[1], 38, 0, TAU); g.fill();
      pin(g, M.x + home[0], M.y + home[1] - (1 - back(hp)) * 70, 1.45, acc);
    }
    g.restore();
    // ranking: our row starts fifth and climbs to first
    const R = { x: 372, y: 16, w: 176 };
    label(g, 'Local ranking', R.x, R.y + 14, col.muted, 12);
    const climb = seg(t, 3.6, 5.4);
    [0, 1, 2, 3, 4].forEach((row, i) => {
      const us = row === 4;
      const slot = us ? lerp(4, 0, climb) : row + climb; // the rows we pass slide down one place
      const y = R.y + 38 + slot * 72;
      const pr = seg(t, 1.6 + i * 0.12, 2.2 + i * 0.12);
      g.save(); g.globalAlpha *= pr;
      roundRect(g, R.x, y, R.w, 58, 12); g.fillStyle = us ? `rgba(${A},0.16)` : col.surface; g.fill(); g.strokeStyle = us ? acc : col.border; g.lineWidth = us ? 1.5 : 1; g.stroke();
      label(g, String(Math.round(slot) + 1), R.x + 20, y + 29, us ? acc : col.muted, 18, 700, 'center');
      bar(g, R.x + 40, y + 18, R.w - 62, 8, us ? acc : col.border);
      bar(g, R.x + 40, y + 34, (R.w - 62) * (us ? 0.6 : 0.5), 6, col.border);
      g.restore();
    });
  };
  const paint = timeline(8, false, draw), paintStill = timeline(8, true, draw);
  return { resize(nw, nh) { w = nw; h = nh; }, frame(dt, now, st) { (st ? paintStill : paint)(ctx, w, h, c, now); } };
}

// page: a wireframe page builds itself and scores 100
function pageBuild(ctx, cv, c) {
  const A = c.accent.join(','), acc = `rgb(${A})`;
  let w = 0, h = 0;
  const W = { x: 50, y: 20, w: 460, h: 380 };
  const draw = (g, t, col) => {
    panel(g, W.x, W.y, W.w, W.h, col, 16); dots(g, W.x + 20, W.y + 20, col);
    g.save(); roundRect(g, W.x, W.y, W.w, W.h, 16); g.clip(); g.translate(W.x, W.y);
    const P = (a, b) => seg(t, a, b);
    // nav
    bar(g, 24, 46, 54, 10, acc, P(0.3, 0.8)); for (let i = 0; i < 3; i++) bar(g, 290 + i * 50, 48, 38, 7, col.border, P(0.5 + i * 0.15, 1.0 + i * 0.15));
    // hero copy
    bar(g, 24, 92, 230, 16, col.text, P(1.0, 1.7)); bar(g, 24, 118, 170, 16, col.text, P(1.2, 1.9));
    bar(g, 24, 150, 210, 8, col.muted, P(1.5, 2.1)); bar(g, 24, 168, 160, 8, col.muted, P(1.6, 2.2)); bar(g, 24, 196, 96, 26, acc, P(1.9, 2.5));
    // hero image
    const ip = P(1.4, 2.4);
    if (ip > 0) { g.save(); g.globalAlpha *= ip; roundRect(g, 276, 92, 160, 134, 12); const gr = g.createLinearGradient(276, 92, 436, 226); gr.addColorStop(0, `rgba(${A},0.5)`); gr.addColorStop(1, `rgba(${A},0.06)`); g.fillStyle = gr; g.fill(); g.fillStyle = `rgba(${A},0.55)`; g.beginPath(); g.moveTo(292, 214); g.lineTo(334, 160); g.lineTo(366, 196); g.lineTo(390, 168); g.lineTo(424, 214); g.closePath(); g.fill(); g.restore(); }
    // cards
    for (let i = 0; i < 3; i++) { const p = P(2.5 + i * 0.25, 3.3 + i * 0.25); if (p > 0) { g.save(); g.globalAlpha *= p; g.translate(0, (1 - p) * 14); roundRect(g, 24 + i * 142, 250, 128, 70, 10); g.fillStyle = col.surface2; g.fill(); g.strokeStyle = col.border; g.stroke(); g.fillStyle = `rgba(${A},0.7)`; g.beginPath(); g.arc(24 + i * 142 + 18, 270, 7, 0, TAU); g.fill(); bar(g, 24 + i * 142 + 14, 292, 98, 6, col.border); bar(g, 24 + i * 142 + 14, 304, 70, 6, col.border); g.restore(); } }
    bar(g, 24, 342, 412, 8, col.border, P(3.6, 4.2));
    // the build front: a scan line that sweeps down while things appear
    const sp = clamp((t - 0.2) / 3.9);
    if (sp > 0 && sp < 1) { const y = 30 + sp * 330; const gr = g.createLinearGradient(0, y - 26, 0, y); gr.addColorStop(0, `rgba(${A},0)`); gr.addColorStop(1, `rgba(${A},0.35)`); g.fillStyle = gr; g.fillRect(0, y - 26, W.w, 26); g.fillStyle = acc; g.fillRect(0, y, W.w, 1.5); }
    g.restore();
    // the score ring
    const rp = seg(t, 4.4, 5.6), cx = W.x + W.w - 34, cy = W.y + W.h - 22;
    if (rp > 0) {
      g.save(); g.globalAlpha *= Math.min(1, rp * 3);
      g.fillStyle = col.surface; g.beginPath(); g.arc(cx, cy, 36, 0, TAU); g.fill();
      g.lineWidth = 6; g.strokeStyle = col.border; g.beginPath(); g.arc(cx, cy, 28, 0, TAU); g.stroke();
      g.strokeStyle = acc; g.lineCap = 'round'; g.beginPath(); g.arc(cx, cy, 28, -Math.PI / 2, -Math.PI / 2 + TAU * rp); g.stroke();
      label(g, String(Math.round(100 * rp)), cx, cy + 1, col.text, 20, 700, 'center');
      g.restore();
    }
  };
  const paint = timeline(8, false, draw), paintStill = timeline(8, true, draw);
  return { resize(nw, nh) { w = nw; h = nh; }, frame(dt, now, st) { (st ? paintStill : paint)(ctx, w, h, c, now); } };
}

const SCENES = { flow, orb, answer, blocks, pins, page: pageBuild };

export function mount(cv) {
  const make = SCENES[cv.dataset.anim];
  if (make) run(cv, make);
}

function start() { document.querySelectorAll('canvas[data-anim]').forEach(mount); }

// Content first: the scenes mount after the page has loaded, so LCP is unchanged.
const later = () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 200));
if (document.readyState === 'complete') later();
else addEventListener('load', later, { once: true });
