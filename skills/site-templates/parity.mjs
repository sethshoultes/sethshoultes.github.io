// Site templates, step 3b (superintelligentfoo#175): the static site and its WordPress theme, page by page, by pixel.
//
//   NODE_PATH=<a node_modules with playwright> node parity.mjs STATIC_ORIGIN WP_ORIGIN OUT_DIR [/ /about/ ...]
//
// For each page at 1280 and 390 wide it takes a full-page screenshot of both, and writes <page>-<width>-static.png,
// -wp.png and -diff.png (red where they differ) to OUT_DIR. It prints one line per pair with the share of pixels that
// differ: a channel more than 32 apart, or a pixel only one page has because the two are different heights. The
// diff runs in the browser on a canvas, so playwright is the only dependency. Exit 0 always: the numbers are the
// result, and the budget is the designer's call (superintelligentfoo#175).
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const [staticOrigin, wpOrigin, out, ...paths] = process.argv.slice(2);
if (!staticOrigin || !wpOrigin || !out) {
  console.error("usage: node parity.mjs STATIC_ORIGIN WP_ORIGIN OUT_DIR [/ /about/ ...]");
  process.exit(2);
}
const pages = paths.length ? paths : ["/"];
const widths = [1280, 390];

const browser = await chromium.launch();
async function shot(url, width) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
  await page.addStyleTag({ content: "#wpadminbar{display:none!important} html{margin-top:0!important}" });
  const png = await page.screenshot({ fullPage: true });
  await ctx.close();
  return png;
}

const differ = await browser.newPage();
for (const path of pages) {
  for (const width of widths) {
    const a = await shot(staticOrigin + path, width);
    const b = await shot(wpOrigin + path, width);
    const name = (path.replace(/^\/|\/$/g, "").replace(/\//g, "-") || "home") + `-${width}`;
    writeFileSync(join(out, `${name}-static.png`), a);
    writeFileSync(join(out, `${name}-wp.png`), b);
    const r = await differ.evaluate(async ([a64, b64]) => {
      const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
      const [ia, ib] = await Promise.all([load(a64), load(b64)]);
      const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
      const px = (img) => { const c = new OffscreenCanvas(w, h); const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, w, h).data; };
      const pa = px(ia), pb = px(ib);
      const c = new OffscreenCanvas(w, h), x = c.getContext("2d"), d = x.createImageData(w, h);
      let diff = 0;
      for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) {
        const k = (y * w + i) * 4, inA = i < ia.width && y < ia.height, inB = i < ib.width && y < ib.height;
        const off = !(inA && inB) || Math.max(Math.abs(pa[k] - pb[k]), Math.abs(pa[k + 1] - pb[k + 1]), Math.abs(pa[k + 2] - pb[k + 2])) > 32;
        if (off) diff++;
        d.data.set(off ? [230, 30, 30, 255] : [pa[k], pa[k + 1], pa[k + 2], 60], k);
      }
      x.putImageData(d, 0, 0);
      const blob = await c.convertToBlob();
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = ""; for (const v of bytes) s += String.fromCharCode(v);
      return { share: diff / (w * h), heights: [ia.height, ib.height], png: btoa(s) };
    }, ["data:image/png;base64," + a.toString("base64"), "data:image/png;base64," + b.toString("base64")]);
    writeFileSync(join(out, `${name}-diff.png`), Buffer.from(r.png, "base64"));
    console.log(`${name}: ${(r.share * 100).toFixed(2)}% of pixels differ (heights ${r.heights[0]} static, ${r.heights[1]} wp)`);
  }
}
await browser.close();
