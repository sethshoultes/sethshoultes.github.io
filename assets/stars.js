// Faint star field with distant planets behind the dark sections (#153). Canvas 2D, no dependencies.
// One fixed layer: three depths of small stars that drift with scroll (you travel through them) and
// three soft planets that cross the margins as the page scrolls. Decoration only, aria-hidden.
//
// Rules it keeps: fixed-position canvas (no layout shift); mounted after load (LCP unchanged);
// prefers-reduced-motion gets one still field with no parallax; draws only while the tab is visible;
// only redraws when the page scrolled or about every 120 ms; the pixel ratio is capped at 1.5.
// Faint on purpose: star alpha tops out below the muted body-text grey and is cut to under half
// across the text column.

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Planets are drawn once into small canvases (crisp edge, one light direction from the upper left,
// a soft terminator, a thin atmosphere on the lit limb) and then just stamped each frame.
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (c, k) => c.map((v) => Math.min(255, v * k));

function planetSprite(p, R, scale) {
  const pad = p.kind === 'ringed' ? 2.35 : 1.4, S = Math.ceil(R * 2 * pad);
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.round(S * scale);
  const g = cv.getContext('2d');
  g.scale(scale, scale);
  g.translate(S / 2, S / 2);
  const t = p.tint;
  const body = () => { g.beginPath(); g.arc(0, 0, R, 0, TAU); };
  const ring = (front) => { // the tilted ring, back or front half
    g.save(); g.rotate(-0.42); g.scale(1, 0.3);
    const bands = [[1.32, 1.5, 0.34], [1.52, 1.58, 0.1], [1.6, 1.92, 0.26]];
    for (const [r0, r1, al] of bands) {
      g.beginPath(); g.arc(0, 0, (r0 + r1) / 2 * R, front ? 0 : Math.PI, front ? Math.PI : TAU);
      g.lineWidth = (r1 - r0) * R; g.strokeStyle = rgba(mix(t, 1.25), al); g.stroke();
    }
    g.restore();
  };
  // atmosphere: a thin, soft halo just outside the edge
  const halo = g.createRadialGradient(0, 0, R * 0.96, 0, 0, R * 1.22);
  halo.addColorStop(0, rgba(mix(t, 1.3), 0.3)); halo.addColorStop(1, rgba(t, 0));
  g.fillStyle = halo; g.beginPath(); g.arc(0, 0, R * 1.22, 0, TAU); g.fill();
  if (p.kind === 'ringed') ring(false);
  // the body
  g.save(); body(); g.clip();
  g.fillStyle = rgba(mix(t, 0.62), 1); g.fillRect(-R, -R, R * 2, R * 2);
  if (p.kind === 'banded') {
    const cols = [0.5, 0.85, 0.62, 1.0, 0.55, 0.9, 0.6, 0.78, 0.5];
    cols.forEach((k, i) => { const y0 = -R + (i / cols.length) * R * 2, bh = (R * 2) / cols.length; g.fillStyle = rgba(mix(t, k * 0.95), 1); g.beginPath(); g.moveTo(-R, y0 + Math.sin(i) * 1.5); for (let x = -R; x <= R; x += R / 5) g.lineTo(x, y0 + Math.sin(x * 0.12 + i * 1.7) * 1.8); g.lineTo(R, y0 + bh + 1); g.lineTo(-R, y0 + bh + 1); g.closePath(); g.fill(); });
    g.fillStyle = rgba(mix(t, 0.45), 0.95); g.beginPath(); g.ellipse(R * 0.22, R * 0.3, R * 0.2, R * 0.11, 0, 0, TAU); g.fill();
    g.strokeStyle = rgba(mix(t, 1.3), 0.5); g.lineWidth = 0.8; g.stroke();
  } else if (p.kind === 'ringed') {
    for (let i = -3; i <= 3; i++) { g.fillStyle = rgba(mix(t, 0.85 + (i % 2) * 0.18), 0.35); g.fillRect(-R, i * R * 0.24 - R * 0.07, R * 2, R * 0.14); }
  } else {
    const craters = [[-0.35, -0.2, 0.26], [0.3, 0.1, 0.2], [-0.05, 0.45, 0.17], [0.38, -0.42, 0.12], [-0.5, 0.3, 0.1]];
    for (const [cx, cy, cr] of craters) {
      g.fillStyle = rgba(mix(t, 0.5), 0.9); g.beginPath(); g.arc(cx * R, cy * R, cr * R, 0, TAU); g.fill();
      g.strokeStyle = rgba(mix(t, 1.4), 0.55); g.lineWidth = 0.8; g.beginPath(); g.arc(cx * R - cr * R * 0.12, cy * R - cr * R * 0.12, cr * R, Math.PI * 0.9, Math.PI * 1.8); g.stroke();
    }
  }
  if (p.kind === 'ringed') { // the ring's shadow falls across the body
    g.save(); g.rotate(-0.42); g.scale(1, 0.3); g.beginPath(); g.arc(0, 0, R * 1.45, 0, TAU); g.rotate(0); g.restore();
    g.save(); g.translate(R * 0.12, R * 0.22); g.rotate(-0.42); g.scale(1, 0.3);
    g.strokeStyle = 'rgba(8,10,14,0.55)'; g.lineWidth = R * 0.4; g.beginPath(); g.arc(0, 0, R * 1.05, 0, TAU); g.stroke(); g.restore();
  }
  // light from the upper left: a bright limb and a soft terminator into shadow
  const lit = g.createRadialGradient(-R * 0.5, -R * 0.5, R * 0.1, -R * 0.15, -R * 0.15, R * 1.55);
  lit.addColorStop(0, 'rgba(255,255,255,0.28)'); lit.addColorStop(0.45, 'rgba(255,255,255,0)'); lit.addColorStop(0.78, 'rgba(6,8,12,0.55)'); lit.addColorStop(1, 'rgba(6,8,12,0.88)');
  g.fillStyle = lit; g.fillRect(-R, -R, R * 2, R * 2);
  g.restore();
  // crisp lit edge
  g.strokeStyle = rgba(mix(t, 1.35), 0.4); g.lineWidth = 1; g.beginPath(); g.arc(0, 0, R - 0.5, Math.PI * 0.95, Math.PI * 1.75); g.stroke();
  if (p.kind === 'ringed') ring(true);
  return { cv, S };
}

function mount(cv) {
  const ctx = cv.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const accent = (getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff6b2c').replace('#', '');
  const warm = [parseInt(accent.slice(0, 2), 16), parseInt(accent.slice(2, 4), 16), parseInt(accent.slice(4, 6), 16)];
  // far layer: many tiny stars; mid: smaller count, brighter; near: few, larger with a soft glow, bright enough to read as stars
  const LAYERS = [
    { d: 0.12, n: 160, r: [0.5, 0.9], a: [0.22, 0.5], glow: false },
    { d: 0.3, n: 70, r: [0.8, 1.3], a: [0.34, 0.7], glow: false },
    { d: 0.6, n: 28, r: [1.5, 2.0], a: [0.6, 0.95], glow: true },
  ];
  const BRIGHT = 12; // a few brighter stars that twinkle slowly
  // planets: x (share of width), y0 (share of height at the top of the page), travel (share of height crossed over the whole page), radius
  const PLANETS = [
    { kind: 'ringed', x: 0.9, y0: 1.0, travel: 1.4, r: 40, tint: [138, 156, 190], ph: 0.4 },
    { kind: 'banded', x: 0.07, y0: 1.15, travel: 1.35, r: 34, tint: warm, ph: 2.1 },
    { kind: 'moon', x: 0.84, y0: 1.7, travel: 1.25, r: 18, tint: [150, 154, 164], ph: 4.0 },
  ];
  const glowDot = (() => { const g = document.createElement('canvas'); g.width = g.height = 32; const c = g.getContext('2d'); const r = c.createRadialGradient(16, 16, 0, 16, 16, 16); r.addColorStop(0, 'rgba(225,232,245,0.55)'); r.addColorStop(0.35, 'rgba(225,232,245,0.14)'); r.addColorStop(1, 'rgba(225,232,245,0)'); c.fillStyle = r; c.fillRect(0, 0, 32, 32); return g; })();
  let w = 0, h = 0, dpr = 1, stars = [], sprites = [], raf = 0, lastY = -1, lastT = 0;

  const build = () => {
    const rand = rng(153);
    const unit = clamp(w / 1200, 0.7, 1.2);
    sprites = PLANETS.map((p) => planetSprite(p, p.r * unit, Math.min(devicePixelRatio || 1, 2)));
    const area = (w * h) / (1440 * 900);
    stars = [];
    LAYERS.forEach((L, li) => {
      const n = Math.round(L.n * clamp(area, 0.5, 1.4));
      for (let i = 0; i < n; i++) stars.push({ li, x: rand() * w, y: rand() * h, r: L.r[0] + rand() * (L.r[1] - L.r[0]), a: L.a[0] + rand() * (L.a[1] - L.a[0]), ph: rand() * TAU, cool: rand() < 0.5, bright: false });
    });
    const mids = stars.filter((s) => s.li > 0);
    for (let i = 0; i < BRIGHT && i < mids.length; i++) { const s = mids[Math.floor(rand() * mids.length)]; s.bright = true; s.r = 1.7 + rand() * 0.8; s.a = 0.9; }
  };

  const size = () => {
    const nw = innerWidth, nh = innerHeight;
    if (nw === w && Math.abs(nh - h) < 150) return; // the phone address bar resizing the viewport is not a reason to rebuild
    w = nw; h = nh;
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
    draw(true);
  };

  // alpha factor across the text column: quiet where words sit, normal in the margins
  const column = (x) => {
    const half = Math.min(560, w * 0.5), d = Math.abs(x - w / 2);
    return 0.4 + 0.6 * smooth(clamp((d - half * 0.55) / (half * 0.5)));
  };

  const draw = (force) => {
    const y = reduced.matches ? 0 : scrollY, now = performance.now();
    if (!force && y === lastY && now - lastT < 120) return;
    lastY = y; lastT = now;
    const doc = Math.max(1, document.documentElement.scrollHeight - h);
    const prog = reduced.matches ? 0.3 : clamp(y / doc);
    const t = reduced.matches ? 0 : now / 1000;
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      const py = (((s.y - y * LAYERS[s.li].d) % h) + h) % h;
      const L = LAYERS[s.li];
      const tw = reduced.matches ? 1 : s.bright ? 0.55 + 0.45 * Math.sin(t * 0.6 + s.ph) : 0.85 + 0.15 * Math.sin(t * 0.8 + s.ph);
      const k = column(s.x) * (w < 600 ? 0.85 : 1);
      if (L.glow || s.bright) { const gr = s.r * (s.bright ? 7 : 5); ctx.globalAlpha = s.a * tw * k * 0.8; ctx.drawImage(glowDot, s.x - gr, py - gr, gr * 2, gr * 2); }
      ctx.globalAlpha = s.a * tw * k;
      ctx.fillStyle = s.cool ? '#dfe7f5' : '#f1ebe2';
      ctx.beginPath(); ctx.arc(s.x, py, s.r, 0, TAU); ctx.fill();
    }
    PLANETS.forEach((p, i) => {
      const { cv: img, S } = sprites[i];
      const cx = p.x * w + Math.cos(t * 0.05 + p.ph) * 6, cy = (p.y0 - prog * p.travel) * h + Math.sin(t * 0.05 + p.ph) * 4;
      if (cy < -S || cy > h + S) return;
      const edge = clamp(1 - Math.abs(cy - h / 2) / (h * 0.75)); // fades in and out near the screen edges
      ctx.globalAlpha = (w < 600 ? 0.55 : 0.8) * clamp(edge * 1.6);
      ctx.drawImage(img, cx - S / 2, cy - S / 2, S, S);
    });
    ctx.globalAlpha = 1;
  };

  const tick = () => { raf = 0; draw(false); if (!document.hidden && !reduced.matches) raf = requestAnimationFrame(tick); };
  const sync = () => {
    if (!document.hidden && !reduced.matches && !raf) raf = requestAnimationFrame(tick);
    if ((document.hidden || reduced.matches) && raf) { cancelAnimationFrame(raf); raf = 0; }
    if (reduced.matches) draw(true);
  };
  addEventListener('resize', size, { passive: true });
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  size();
  sync();
}

function start() { document.querySelectorAll('canvas[data-starfield]').forEach(mount); }

// Content first: mounts after the page has loaded, so LCP is unchanged.
const later = () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 200));
if (document.readyState === 'complete') later();
else addEventListener('load', later, { once: true });
