// plugins/hero-scenes: the engine against a tiny fake page whose canvases record every draw call. The done-means (the lead on
// site-kit#282): the same seed paints the same still frame, prefers-reduced-motion gets exactly one frame, the engine stops
// off-screen, and the words come from the settings. The 25 KB gzipped budget is in tests/test_hero_scenes_plugin.py.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const SOURCE = fs.readFileSync(path.join(__dirname, "../assets/hero-scenes.js"), "utf8");

// A drawing context that records each call and each style set, in order.
function recorder(log) {
  const gradient = { addColorStop() {} };
  const target = {};
  return new Proxy(target, {
    get(_, k) {
      if (k === "measureText") return (t) => ({ width: String(t).length * 7 });
      if (k === "createRadialGradient" || k === "createLinearGradient") return () => gradient;
      if (k in target) return target[k];
      return (...args) => { log.push([k, ...args.map((a) => (typeof a === "number" ? Math.round(a * 100) / 100 : typeof a === "string" ? a : typeof a))]); };
    },
    set(_, k, v) { target[k] = v; log.push(["=" + String(k), typeof v === "number" ? Math.round(v * 100) / 100 : typeof v === "object" ? "obj" : v]); return true; },
  });
}

function element(tag, page) {
  const el = {
    tagName: tag, dataset: {}, style: {}, children: [], width: 0, height: 0, className: "",
    log: [],
    getContext() { return (this.ctx ||= recorder(this.log)); },
    rect: { left: 0, top: 100, right: 560, bottom: 520, width: 560, height: 420 },
    getBoundingClientRect() { return this.rect; },
    appendChild(c) { this.children.push(c); c.parentElement = this; return c; },
    querySelector: () => null,
    remove() {},
  };
  (page.made ||= []).push(el);
  return el;
}

// One fake page: a canvas per scene, with reduced motion on or off. Returns the page's handles.
async function page({ reduced = false, settings = null } = {}) {
  const raf = { next: 1, pending: new Map(), cancelled: 0 };
  const observers = [];
  const page = { raf, observers, listeners: {} };
  const doc = {
    hidden: false, readyState: "loading",
    documentElement: { addEventListener() {} },
    createElement: (tag) => element(tag, page),
    getElementById: (id) => (id === "hero-scenes-settings" && settings ? { textContent: JSON.stringify(settings) } : null),
    querySelectorAll: (sel) => (sel === "canvas[data-anim]" ? page.canvases || [] : []),
    addEventListener: (n, fn) => { page.listeners[n] = fn; },
  };
  Object.assign(globalThis, {
    document: doc, window: globalThis, innerHeight: 800, devicePixelRatio: 1,
    getComputedStyle: () => ({ getPropertyValue: () => "", paddingLeft: "20", paddingRight: "20" }),
    matchMedia: () => ({ matches: reduced, addEventListener() {} }),
    requestAnimationFrame: (fn) => { const id = raf.next++; raf.pending.set(id, fn); return id; },
    cancelAnimationFrame: (id) => { if (raf.pending.delete(id)) raf.cancelled++; },
    ResizeObserver: class { observe() {} },
    IntersectionObserver: class { constructor(fn) { observers.push(fn); } observe() {} },
    addEventListener: (n, fn) => { page.listeners[n] = fn; },
  });
  // A fresh module per page, so its settings and scene list start clean.
  page.mod = await import("data:text/javascript," + encodeURIComponent(SOURCE + "\n//" + Math.random()));
  return page;
}

function canvas(page, scene) {
  const parent = element("figure", page);
  const cv = element("canvas", page);
  parent.appendChild(cv);
  cv.dataset.anim = scene;
  return cv;
}

const SCENES = ["flow", "orb", "answer", "blocks", "pins", "page"];

test("the same seed paints the same still frame, for every scene", async () => {
  for (const scene of SCENES) {
    const frames = [];
    for (let i = 0; i < 2; i++) {
      const p = await page({ reduced: true });
      const cv = canvas(p, scene);
      p.mod.mount(cv);
      frames.push(JSON.stringify(cv.log));
    }
    assert.ok(frames[0].length > 200, `${scene} drew something`);
    assert.strictEqual(frames[0], frames[1], `${scene}: two still frames differ`);
  }
});

test("prefers-reduced-motion gets exactly one frame: the still one, the same each time it is painted, and the loop never starts", async () => {
  for (const scene of SCENES) {
    const p = await page({ reduced: true });
    const cv = canvas(p, scene);
    const paints = [];
    p.mod.register("counted", (...args) => {
      const s = p.mod.SCENES[scene](...args);
      return { ...s, frame: (dt, now, still) => { const from = cv.log.length; s.frame(dt, now, still); paints.push([still, JSON.stringify(cv.log.slice(from))]); } };
    });
    cv.dataset.anim = "counted";
    p.mod.mount(cv);
    p.observers.forEach((fn) => fn([{ isIntersecting: true }]));   // on screen: a moving scene would start here
    p.listeners.visibilitychange?.();
    assert.strictEqual(p.raf.pending.size, 0, `${scene}: no animation frame requested`);
    assert.ok(paints.length >= 1, `${scene}: painted`);
    assert.ok(paints.every(([still]) => still === true), `${scene}: every paint is the still frame`);
    assert.strictEqual(new Set(paints.map(([, drawn]) => drawn)).size, 1, `${scene}: one picture, however often it is painted`);
  }
});

test("the engine runs on screen and stops off-screen", async () => {
  const p = await page();
  const cv = canvas(p, "orb");
  p.mod.mount(cv);
  assert.strictEqual(p.raf.pending.size, 0, "nothing runs before it is on screen");
  p.observers[0]([{ isIntersecting: true }]);
  assert.strictEqual(p.raf.pending.size, 1, "on screen: the loop runs");
  const [[id, tick]] = p.raf.pending;
  p.raf.pending.delete(id); tick(16);
  assert.strictEqual(p.raf.pending.size, 1, "and keeps running");
  p.observers[0]([{ isIntersecting: false }]);
  assert.strictEqual(p.raf.pending.size, 0, "off-screen: the frame is cancelled");
  assert.strictEqual(p.raf.cancelled, 1);
});

test("the words come from the settings, a site's own scene runs, and a scene the settings leave out does not", async () => {
  const words = {
    scenes: ["flow", "answer"], assistants: ["Asker", "Finder", "Helper"], sources: ["Hours", "Menus", "Photos"],
    question: "Best tacos in town?", answer_label: "The answer", citation: "[1] example.test", ranking_label: "Top spots",
    cited: ["example.test is cited", "cited"], font: "Georgia, serif",
  };
  const p = await page({ reduced: true, settings: words });
  p.page = p;
  // start() reads the settings: run it as the page's load would.
  p.canvases = [canvas(p, "flow"), canvas(p, "answer"), canvas(p, "orb"), canvas(p, "story")];
  p.mod.register("story", () => ({ resize() {}, frame() { p.canvases[3].ran = true; } }));
  p.listeners.load?.();
  await new Promise((r) => setTimeout(r, 400));
  const text = JSON.stringify(p.made.map((c) => c.log));   // flow draws its labels onto an offscreen canvas
  for (const w of ["Asker", "Finder", "Helper", "Hours", "Best tacos in town?", "The answer", "[1] example.test", "Georgia, serif"]) {
    assert.ok(text.includes(w), `drew "${w}"`);
  }
  for (const w of ["AI search", "Services", "Who is best near me?"]) assert.ok(!text.includes(w), `no default "${w}"`);
  assert.ok(p.canvases[0].log.length > 0 && p.canvases[1].log.length > 0, "flow and answer ran");
  assert.strictEqual(p.canvases[2].log.length, 0, "orb is not in this site's scenes");
  assert.strictEqual(p.canvases[3].ran, true, "the site's own scene ran");
});

test("flow draws the settings' names in both of its layouts, wide and on a tall phone canvas", async () => {
  const words = { assistants: ["Asker", "Finder", "Helper"], sources: ["Hours", "Menus", "Photos"] };
  for (const rect of [{ width: 560, height: 420 }, { width: 360, height: 640 }]) {
    const p = await page({ reduced: true, settings: words });
    const cv = canvas(p, "flow");
    cv.rect = { left: 0, top: 100, right: rect.width, bottom: 100 + rect.height, ...rect };
    p.canvases = [cv];
    p.listeners.load?.();
    await new Promise((r) => setTimeout(r, 300));
    const text = JSON.stringify(p.made.map((c) => c.log));
    for (const w of [...words.assistants, ...words.sources]) assert.ok(text.includes(w), `${rect.width}px wide: drew "${w}"`);
  }
});

test("pins: while our listing climbs, the ranking never shows the same number twice (site-kit#290)", async () => {
  const p = await page();
  const log = [];
  const ctx = recorder(log);
  const colours = { accent: [255, 107, 44], surface: "#14171c", surface2: "#1b1f26", border: "#262b33", text: "#f4f4f5", muted: "#a1a7b0", ink: "#0b0d10" };
  const scene = p.mod.SCENES.pins(ctx, canvas(p, "pins"), colours, () => 1);
  scene.resize(560, 420);
  // the climb runs from 3.6 s to 5.4 s of the 8 s loop; step through it, and a little either side, every 20 ms
  for (let now = 3400; now <= 5600; now += 20) {
    log.length = 0;
    scene.frame(0.02, now, false);
    const ranks = log.filter((c) => c[0] === "fillText" && /^[1-5]$/.test(c[1])).map((c) => c[1]).sort();
    assert.deepStrictEqual(ranks, ["1", "2", "3", "4", "5"], `at ${now} ms the ranking showed ${ranks.join(",")}`);
  }
});
