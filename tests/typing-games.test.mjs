// The typing games' pages (typing-games/): each page's own inline script, run in node:vm against a small fake DOM, so a
// behaviour a player meets first is held by a test without a browser (no install step, like every test here).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Anything the page reaches for that a test does not look at (a canvas context, a style, a child node) is a quiet sink.
const sink = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : sink()), apply: () => sink(), set: () => true });

function fakePage(html, { innerWidth = 1280, innerHeight = 800, rects = {}, coarse = false } = {}) {
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
        getBoundingClientRect: () => rects[id] ?? { left: 0, top: 0, width: 800, height: 600, bottom: 600 },
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
    performance: { now: () => 0 }, matchMedia: (q) => ({ matches: coarse && q.includes('coarse') }), innerWidth, innerHeight,
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

// sethshoultes.github.io#286: the scoreboard is solid, so a star under it would vanish. On a phone it spans the top and
// the star stays below it; on a desktop it is a corner box and the star keeps the whole screen.
const typingStar = (opts) => fakePage(readFileSync(new URL('../typing-games/typing-game-1.html', import.meta.url), 'utf8'), opts);
const starTopAfterAFrame = (page) => {
  page.element('cardButton').click(); // Start
  vm.runInContext('words.length = 0; player.y = 0;', page.ctx); // no word to catch; steer straight up
  page.frames.at(-1)();
  return vm.runInContext('player.y', page.ctx);
};

test('AI Typing Star: on a phone the star stops below the scoreboard and the word box, on a desktop at the top edge', () => {
  const wordBox = { left: 79, width: 232, top: 104, bottom: 144 }; // where the touch CSS puts it at 390x844 (measured)
  const phone = typingStar({ innerWidth: 390, innerHeight: 844, coarse: true, rects: { scoreboard: { left: 51, width: 323, top: 16, bottom: 80 }, wordInput: wordBox } });
  const y = starTopAfterAFrame(phone);
  assert.ok(y - 30 >= wordBox.bottom, `the star (${y - 30} to ${y + 30}) overlaps the word box (${wordBox.top} to ${wordBox.bottom})`);
  assert.equal(y, 144 + 30); // the word box's bottom plus the star's size
  assert.equal(phone.element('wordInput').style.display, 'none'); // measuring it never leaves it showing
  const narrowMouse = typingStar({ innerWidth: 390, innerHeight: 844, rects: { scoreboard: { left: 51, width: 323, top: 16, bottom: 80 }, wordInput: wordBox } });
  assert.equal(starTopAfterAFrame(narrowMouse), 80 + 30); // a narrow desktop window: the word box is centred, only the board counts
  const desktop = typingStar({ rects: { scoreboard: { left: 979, width: 285, top: 16, bottom: 80 } } });
  assert.equal(starTopAfterAFrame(desktop), 30);
});

// The HUD's power-up label shows only while one is on, so a round after Main Menu reads like the first one.
test('Typing Invaders: the HUD says "Active:" only while a power-up is on, and Main Menu clears it', () => {
  const { ctx, element } = invaders();
  element('startButton').click();
  ctx.game.activePowerUps.add('timeFreeze');
  ctx.game.updateActivePowerUps();
  assert.equal(element('powerUpStatus').textContent, ' | Active: ⏸️ ');
  ctx.game.activePowerUps.clear();
  ctx.game.updateActivePowerUps();
  assert.equal(element('powerUpStatus').textContent, '');
  ctx.game.activePowerUps.add('wordClear'); // 💥 never removes its own id, so a round that had one ends with it "active"
  ctx.game.updateActivePowerUps();
  ctx.game.showMainMenu(); // no frame runs behind the card, so reset() itself must clear the label
  assert.equal(element('powerUpStatus').textContent, '');
});

// 💥 clears the board the moment it is collected, so it never shows as Active; a lasting one (🛡️) does.
test('Typing Invaders: collecting 💥 clears the words and scores them, but only a lasting power-up shows as Active', () => {
  const { ctx, element } = invaders();
  element('startButton').click();
  const game = ctx.game;
  const kind = (id) => ({ ...game.powerUpTypes[id], id });
  game.words = [{ text: 'abc' }, { text: 'de' }];
  game.powerUps = [{ type: kind('wordClear') }];
  game.collectPowerUp(0);
  assert.equal(game.words.length, 0);
  assert.equal(game.score, 25); // 5 points a letter
  assert.equal(String(element('score').textContent), '25'); // and the HUD shows them at once
  assert.equal(game.activePowerUps.has('wordClear'), false);
  game.updateActivePowerUps();
  assert.equal(element('powerUpStatus').textContent, '');
  game.powerUps = [{ type: kind('shield') }];
  game.collectPowerUp(0);
  assert.equal(game.activePowerUps.has('shield'), true);
  game.powerUps = [{ type: kind('timeFreeze') }];
  game.collectPowerUp(0);
  assert.equal(game.activePowerUps.has('timeFreeze'), true); // ⏸️ lasts 5 s, so it shows too
  assert.equal(game.powerUpsCollected, 3);
});
