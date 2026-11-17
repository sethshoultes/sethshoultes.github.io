// The typing games' pages (typing-games/): each page's own inline script, run in node:vm against a small fake DOM, so a
// behaviour a player meets first is held by a test without a browser (no install step, like every test here).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Anything the page reaches for that a test does not look at (a canvas context, a style, a child node) is a quiet sink.
const sink = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : sink()), apply: () => sink(), set: () => true });

function fakePage(html) {
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
  const frames = [], elements = new Map();
  const doc = { activeElement: null };
  const element = (id) => {
    if (!elements.has(id)) {
      const listeners = {};
      const el = {
        id, hidden: false, value: '', textContent: '', innerHTML: '', style: { display: '' }, width: 800, height: 600,
        addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); },
        click: () => (listeners.click ?? []).forEach((fn) => fn({ pointerType: 'mouse' })),
        focus: () => { doc.activeElement = el; },
        blur: () => { if (doc.activeElement === el) doc.activeElement = null; },
        getContext: () => sink(), querySelector: () => sink(), querySelectorAll: () => [], appendChild: () => {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      };
      el.hidden = new RegExp(`<[^>]*\\bid="${id}"[^>]*\\shidden[\\s>=]`).test(html); // as the page's HTML sets it
      elements.set(id, el);
    }
    return elements.get(id);
  };
  Object.assign(doc, { getElementById: element, addEventListener: () => {}, createElement: () => sink(), querySelector: () => sink() });
  const store = new Map();
  const ctx = {
    document: doc, console, Math, Date, JSON, Map, Set, Number, String, Array, Object, Promise,
    requestAnimationFrame: (fn) => frames.push(fn), setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0,
    performance: { now: () => 0 }, matchMedia: () => ({ matches: false }), innerWidth: 1280, innerHeight: 800,
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
    addEventListener: () => {},
  };
  ctx.window = ctx;
  vm.runInNewContext(script, ctx);
  if (typeof ctx.onload === 'function') ctx.onload(); // the page has loaded, as a browser would say
  return { ctx, doc, element, frames };
}

const invaders = () => fakePage(readFileSync(new URL('../typing-games/typinginvaders.html', import.meta.url), 'utf8'));

// sethshoultes/arcade#322: the round waits on the start card instead of starting on page load.
test('Typing Invaders: on load the start card shows, Start has focus, and no game or frame has started', () => {
  const { ctx, doc, element, frames } = invaders();
  assert.equal(ctx.game, undefined);
  assert.equal(frames.length, 0);
  assert.equal(element('startCard').hidden, false);
  assert.equal(doc.activeElement, element('startButton')); // a keyboard starts it with Enter or Space, no Tab first
});

test('Typing Invaders: Start makes the game, hides the card and starts the loop; Main Menu brings the card back over a cleared board with Start focused', () => {
  const { ctx, doc, element, frames } = invaders();
  element('startButton').click();
  assert.equal(typeof ctx.game, 'object');
  assert.equal(element('startCard').hidden, true);
  assert.equal(frames.length, 1);
  doc.activeElement = null; // a browser takes focus off a button whose card is hidden; Main Menu must give it back
  Object.assign(ctx.game, { score: 120, lives: 1 });
  ctx.game.updateHUD();
  element('currentWord').textContent = 'gal';
  ctx.game.showMainMenu();
  assert.equal(String(element('score').textContent), '0'); // the card shows over an empty board, not the last round's HUD
  assert.equal(element('lives').textContent, '♥♥♥');
  assert.equal(element('currentWord').textContent, '');
  assert.equal(element('startCard').hidden, false);
  assert.equal(doc.activeElement, element('startButton'));
  const game = ctx.game;
  element('startButton').click(); // a later Start restarts the same game
  assert.equal(ctx.game, game);
  assert.equal(element('startCard').hidden, true);
  assert.equal(frames.length, 2);
});
