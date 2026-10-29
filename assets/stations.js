// A space station and a ship, built as the page scrolls (#165, /projects/). Canvas 2D line art,
// no dependencies. It sits on its own fixed layer in the margin, above the star field and below
// the content, and is decoration only (aria-hidden). Scrolling down builds it in stages:
// spine, ring, spokes, hub, solar arrays, hull panels, docking arm, then a ship flies in and
// docks. Scrolling back un-builds it. prefers-reduced-motion shows the finished station, still.

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t) => t * t * (3 - 2 * t);
const seg = (p, a, b) => smooth(clamp((p - a) / (b - a)));
const lerp = (a, b, t) => a + (b - a) * t;

function mount(cv) {
  const ctx = cv.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const css = getComputedStyle(document.documentElement);
  const hex = (css.getPropertyValue('--accent').trim() || '#ff6b2c').replace('#', '');
  const accent = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');
  const LINE = '170,186,212';
  let w = 0, h = 0, raf = 0, onScreen = true, lastY = -1, lastT = 0;

  const size = () => {
    const nw = innerWidth, nh = innerHeight;
    if (nw === w && Math.abs(nh - h) < 150) return;
    w = nw; h = nh;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(true);
  };

  // A line that grows from (x1,y1) toward (x2,y2) as p goes 0 to 1.
  const line = (x1, y1, x2, y2, p) => {
    if (p <= 0) return;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(lerp(x1, x2, p), lerp(y1, y2, p)); ctx.stroke();
  };

  const station = (R, prog, t) => {
    const tilt = -0.28, rx = R, ry = R * 0.36;
    const stroke = (alpha, width = 1.2) => { ctx.strokeStyle = `rgba(${LINE},${alpha})`; ctx.lineWidth = width; };
    // the ghost of the finished ring, so it reads as being built rather than appearing
    stroke(0.12); ctx.setLineDash([3, 5]);
    ctx.save(); ctx.rotate(tilt); ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.stroke(); ctx.restore();
    ctx.setLineDash([]);
    // 1 spine
    stroke(0.55); line(0, -R * 1.35, 0, R * 1.35, seg(prog, 0.02, 0.16));
    // 2 ring, drawn around, with a thinner inner ring
    const pr = seg(prog, 0.12, 0.32);
    if (pr > 0) { ctx.save(); ctx.rotate(tilt); stroke(0.6, 1.6); ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, -Math.PI / 2, -Math.PI / 2 + TAU * pr); ctx.stroke(); stroke(0.3); ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.82, ry * 0.82, 0, -Math.PI / 2, -Math.PI / 2 + TAU * pr); ctx.stroke(); ctx.restore(); }
    // 3 spokes from the hub to the ring
    ctx.save(); ctx.rotate(tilt);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + t * 0.04, p = seg(prog, 0.28 + i * 0.015, 0.42 + i * 0.015); stroke(0.4); line(0, 0, Math.cos(a) * rx * 0.82, Math.sin(a) * ry * 0.82, p); }
    ctx.restore();
    // 4 hub
    const ph = seg(prog, 0.3, 0.4);
    if (ph > 0) { ctx.fillStyle = `rgba(${LINE},${0.25 * ph})`; ctx.strokeStyle = `rgba(${LINE},${0.7 * ph})`; ctx.beginPath(); ctx.arc(0, 0, R * 0.13 * ph, 0, TAU); ctx.fill(); ctx.stroke(); }
    // 5 solar arrays on arms at both ends of the spine
    for (const side of [-1, 1]) {
      const p = seg(prog, 0.4, 0.6), y = side * R * 1.25;
      stroke(0.5); line(0, y, -R * 1.5, y, p); line(0, y, R * 1.5, y, p);
      for (const dir of [-1, 1]) {
        const pw = seg(prog, 0.46, 0.62), x0 = dir * R * 0.5, pwid = R * 0.9 * pw, ph2 = R * 0.28;
        if (pw <= 0) continue;
        const x = dir > 0 ? x0 : x0 - pwid;
        ctx.strokeStyle = `rgba(${LINE},0.5)`; ctx.fillStyle = `rgba(${LINE},0.07)`; ctx.beginPath(); ctx.rect(x, y - ph2 / 2, pwid, ph2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = `rgba(${LINE},0.25)`; for (let g = 1; g < 4; g++) { ctx.beginPath(); ctx.moveTo(x + (pwid * g) / 4, y - ph2 / 2); ctx.lineTo(x + (pwid * g) / 4, y + ph2 / 2); ctx.stroke(); }
      }
    }
    // 6 lit hull panels along the ring, in the accent
    ctx.save(); ctx.rotate(tilt);
    for (let i = 0; i < 6; i++) {
      const p = seg(prog, 0.52 + i * 0.03, 0.62 + i * 0.03); if (p <= 0) continue;
      const a0 = (i / 6) * TAU + 0.12, a1 = a0 + (TAU / 6) * 0.62 * p;
      ctx.strokeStyle = `rgba(${accent},${0.55 * p})`; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, a0, a1); ctx.stroke();
    }
    ctx.restore();
    // 7 docking arm, with a clamp at the end
    const pd = seg(prog, 0.72, 0.84), dx = R * 2.05, dy = R * 0.2;
    stroke(0.6, 1.4); line(R * 0.95, R * 0.02, dx, dy, pd);
    if (pd > 0.95) { ctx.strokeStyle = `rgba(${accent},0.8)`; ctx.beginPath(); ctx.rect(dx, dy - R * 0.06, R * 0.1, R * 0.12); ctx.stroke(); }
    // 8 a ship flies in along a curve and docks
    const ps = seg(prog, 0.8, 0.98);
    if (ps > 0) {
      const sx = lerp(R * 4.2, dx + R * 0.45, ps), sy = lerp(R * 2.6, dy, ps) - Math.sin(ps * Math.PI) * R * 0.5;
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(ps < 1 ? Math.atan2(dy - sy, dx - sx) * 0.4 : 0); // the nose leans toward the dock, then levels out
      ctx.strokeStyle = `rgba(${LINE},0.75)`; ctx.lineWidth = 1.2; ctx.fillStyle = 'rgba(11,13,16,0.6)';
      const L = R * 0.5; ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(-L * 0.2, -L * 0.28); ctx.lineTo(L * 0.7, -L * 0.14); ctx.lineTo(L, 0); ctx.lineTo(L * 0.7, L * 0.14); ctx.lineTo(-L * 0.2, L * 0.28); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-L * 0.2, -L * 0.28); ctx.lineTo(-L * 0.55, -L * 0.5); ctx.moveTo(-L * 0.2, L * 0.28); ctx.lineTo(-L * 0.55, L * 0.5); ctx.stroke();
      if (ps < 1) { const fl = 0.7 + 0.3 * Math.sin(t * 20); ctx.strokeStyle = `rgba(${accent},${0.8 * fl})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-L, 0); ctx.lineTo(-L * (1.5 + 0.4 * fl), 0); ctx.stroke(); }
      ctx.restore();
    }
  };

  const draw = (force) => {
    const y = reduced.matches ? 0 : scrollY, now = performance.now();
    if (!force && y === lastY && now - lastT < 100) return;
    lastY = y; lastT = now;
    const doc = Math.max(1, document.documentElement.scrollHeight - h);
    const prog = reduced.matches ? 1 : clamp(y / doc / 0.92); // finished by 92% of the page, so the docked ship is on screen
    const t = reduced.matches ? 0 : now / 1000;
    ctx.clearRect(0, 0, w, h);
    const phone = w < 700;
    const R = Math.min(w, h) * (phone ? 0.075 : w < 1500 ? 0.07 : 0.085);
    ctx.save();
    ctx.translate(phone ? w * 0.66 : w - R * 3.5, phone ? h * 0.2 : h * 0.5); // the docked ship reaches about w - 0.5R, never past the edge
    // On laptop widths the margin is narrow and the station overlaps the content column, so it dims there.
    ctx.globalAlpha = phone ? 0.5 : w < 1500 ? 0.3 : 0.85;
    station(R, prog, t);
    ctx.restore();
  };

  const tick = () => { raf = 0; draw(false); if (onScreen && !document.hidden && !reduced.matches) raf = requestAnimationFrame(tick); };
  const sync = () => {
    if (!document.hidden && !reduced.matches && !raf) raf = requestAnimationFrame(tick);
    if ((document.hidden || reduced.matches) && raf) { cancelAnimationFrame(raf); raf = 0; }
    if (reduced.matches || document.hidden) draw(true);
  };
  addEventListener('resize', size, { passive: true });
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  size();
  sync();
}

function start() { document.querySelectorAll('canvas[data-stations]').forEach(mount); }

// Content first: mounts after the page has loaded, so LCP is unchanged.
const later = () => (window.requestIdleCallback ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 200));
if (document.readyState === 'complete') later();
else addEventListener('load', later, { once: true });
