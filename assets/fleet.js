// fleet (#165): sethshoultes.com's own hero scene, the agent team on /consulting/. It runs on the kit's hero-scenes engine
// (site-kit#282), which it registers with; the engine owns the canvas, the loop and every reason to stop it.
import { register, TAU, clamp, ease, lerp, seg, sprite, roundRect, label } from '/assets/vendor/site-kit/plugins/hero-scenes/assets/hero-scenes.js';

// fleet: the agent team (/consulting/). Nodes light up as the section scrolls into view, a task passes
// from one agent to the next, then the conversation types itself out. The same lines are in the page's
// HTML caption; the canvas is decoration. Reduced motion draws everything finished.
const FLEET = [
  { who: 'You', line: 'Add a page for the new service.' },
  { who: 'Writer', line: 'Draft is ready.' },
  { who: 'Checker', line: 'Facts and links checked.' },
  { who: 'Publisher', line: 'Live on the site.' },
  { who: 'Reporter', line: 'Summary sent to you.' },
];

register('fleet', function fleet(ctx, cv, c) {
  const A = c.accent.join(',');
  const dot = sprite(A, 14);
  let w = 0, h = 0;
  const node = (i, n, cx, cy, rx, ry) => { const a = -Math.PI / 2 + (i / n) * TAU; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; };
  return {
    resize(nw, nh) { w = nw; h = nh; },
    frame(dt, now, still) {
      const vh = window.innerHeight, top = cv.getBoundingClientRect().top;
      const p = still ? 1 : clamp((vh * 0.92 - top) / (vh * 0.8));
      ctx.clearRect(0, 0, w, h);
      const k = Math.min(w / 800, h / 360), fs = clamp(13 * k, 12, 15);
      const tall = w < h * 1.1; // phones: nodes on top, the chat below at full width
      const cx = tall ? w * 0.5 : w * 0.3, cy = tall ? h * 0.24 : h * 0.5, rx = tall ? w * 0.3 : w * 0.2, ry = tall ? h * 0.17 : h * 0.36;
      const pos = FLEET.map((_, i) => node(i, FLEET.length, cx, cy, rx, ry));
      // the links between agents
      ctx.lineWidth = 1;
      for (let i = 0; i < FLEET.length; i++) {
        const j = (i + 1) % FLEET.length, lp = seg(p, 0.05 + i * 0.05, 0.3 + i * 0.05);
        ctx.strokeStyle = `rgba(${A},${0.4 * lp})`;
        ctx.beginPath(); ctx.moveTo(pos[i][0], pos[i][1]); ctx.lineTo(lerp(pos[i][0], pos[j][0], lp), lerp(pos[i][1], pos[j][1], lp)); ctx.stroke();
      }
      // a task passes along the links
      const hop = clamp((p - 0.3) / 0.4) * FLEET.length; // 0..5: which link the packet is on
      ctx.globalCompositeOperation = 'lighter';
      if (p > 0.3 && p < 0.72) {
        const i = Math.min(FLEET.length - 1, Math.floor(hop)), f = ease(hop - i), j = (i + 1) % FLEET.length;
        const x = lerp(pos[i][0], pos[j][0], f), y = lerp(pos[i][1], pos[j][1], f);
        ctx.globalAlpha = 1; ctx.drawImage(dot, x - 20, y - 20, 40, 40); ctx.drawImage(dot, x - 10, y - 10, 20, 20);
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      // the agents
      FLEET.forEach((a, i) => {
        const np = seg(p, i * 0.05, 0.12 + i * 0.05), lit = clamp(1 - Math.abs(hop - i - 0.1) / 1.2) * (p > 0.3 ? 1 : 0) + (p >= 0.72 ? 0.3 : 0);
        const [x, y] = pos[i], bw = tall ? 86 : 96 * k + 24, bh = tall ? 32 : 34 * k + 8;
        ctx.save(); ctx.globalAlpha = np;
        roundRect(ctx, x - bw / 2, y - bh / 2, bw, bh, bh / 2);
        ctx.fillStyle = c.surface2; ctx.fill();
        ctx.strokeStyle = `rgba(${A},${0.25 + 0.6 * clamp(lit)})`; ctx.lineWidth = 1 + clamp(lit); ctx.stroke();
        label(ctx, a.who, x, y, c.text, fs, 600, 'center');
        ctx.restore();
      });
      // the conversation, typed out on the right
      const tx = tall ? w * 0.05 : w * 0.58, ty = tall ? h * 0.5 : h * 0.14, lh = tall ? h * 0.1 : h * 0.16, bw = tall ? w * 0.9 : w * 0.38;
      const typed = clamp((p - 0.7) / 0.3) * FLEET.length;
      FLEET.forEach((a, i) => {
        const shown = clamp(typed - i);
        if (shown <= 0) return;
        const y = ty + i * lh, text = a.line.slice(0, Math.ceil(a.line.length * shown));
        roundRect(ctx, tx, y, bw, lh * 0.76, 10);
        ctx.fillStyle = a.who === 'You' ? `rgba(${A},0.9)` : c.surface; ctx.fill();
        if (a.who !== 'You') { ctx.strokeStyle = c.border; ctx.lineWidth = 1; ctx.stroke(); }
        label(ctx, a.who, tx + 12, y + lh * 0.2, a.who === 'You' ? '#0b0d10' : `rgb(${A})`, fs * 0.85, 700);
        label(ctx, text, tx + 12, y + lh * 0.5, a.who === 'You' ? '#0b0d10' : c.text, fs, 500);
      });
    },
  };
});
