import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { grocery, listText } = require('../assets/meals.js');

// the planner reads the same data the page does: _data/meals.yml, parsed by hand here to avoid a YAML dependency
const meals = {
  stores: [{ key: 'costco', name: 'Costco' }, { key: 'smiths', name: "Smith's" }, { key: 'other', name: 'Anywhere else' }],
  meals: [
    { slug: 'salmon', name: 'Salmon', ingredients: [{ item: 'Salmon', store: 'costco' }] },
    { slug: 'pizza', name: 'Pizza', ingredients: [{ item: 'Pizza dough mix', store: 'smiths' }, { item: 'Mozzarella' }] },
    { slug: 'stir', name: 'Stir fry', ingredients: [{ item: 'Hamburger', qty: '1 lb' }, { item: 'Mozzarella' }] },
  ],
};

test('items group by store, default to anywhere else, and sort', () => {
  const g = grocery(meals, { mon: { meals: ['salmon', 'pizza'] } }, {});
  assert.deepEqual(g.costco.map((l) => l.label), ['Salmon']);
  assert.deepEqual(g.smiths.map((l) => l.label), ['Pizza dough mix']);
  assert.deepEqual(g.other.map((l) => l.label), ['Mozzarella']);
});

test('the same item from two meals is one line that names both meals', () => {
  const g = grocery(meals, { mon: { meals: ['pizza'] }, tue: { meals: ['stir'] } }, {});
  assert.equal(g.other.length, 2);
  const m = g.other.find((l) => l.label === 'Mozzarella');
  assert.equal(m.details.length, 2);
  assert.match(m.details.join(';'), /Pizza/);
  assert.match(m.details.join(';'), /Stir fry/);
});

test('a meal added twice does not duplicate its items', () => {
  const g = grocery(meals, { mon: { meals: ['salmon'] }, wed: { meals: ['salmon'] } }, {});
  assert.equal(g.costco.length, 1);
});

test('a typed meal adds no items, and an unknown id is ignored', () => {
  const g = grocery(meals, { mon: { meals: ['Leftovers', 'nope'] } }, {});
  assert.equal(g.costco.length + g.smiths.length + g.other.length, 0);
});

test('a store the user picked wins, and an unknown store falls back to anywhere else', () => {
  const g = grocery(meals, { mon: { meals: ['stir'] } }, { stores: { hamburger: 'costco', mozzarella: 'nowhere' } });
  assert.deepEqual(g.costco.map((l) => l.label), ['Hamburger']);
  assert.deepEqual(g.other.map((l) => l.label), ['Mozzarella']);
});

test('extras land on the list, and checked items leave the text', () => {
  const g = grocery(meals, { mon: { meals: ['salmon'] } }, { extras: [{ item: 'Milk', store: 'smiths' }] });
  assert.deepEqual(g.smiths.map((l) => l.label), ['Milk']);
  const t = listText(meals, g, { salmon: true });
  assert.ok(!t.includes('Salmon'));
  assert.match(t, /Smith's\n- Milk/);
});

test('the shipped meals only carry what Seth and the sources gave', () => {
  const yml = readFileSync(new URL('../_data/meals.yml', import.meta.url), 'utf8');
  for (const slug of ['costco-salmon-in-the-air-fryer', 'ooni-pizza', 'hamburger-stir-fry', 'slow-cooker-ramen', 'biscuits-and-gravy-casserole']) {
    assert.ok(yml.includes(`slug: ${slug}`), slug);
  }
  // every meal that has a source links to it; Seth's own meals do not carry a made-up one
  const blocks = yml.split('  - slug: ').slice(1);
  for (const b of blocks) {
    if (b.includes('kind: "Family favorite"')) assert.match(b, /source: \{ name: .+url: "https:\/\//);
    if (b.includes("kind: \"Seth's way\"")) assert.ok(!b.includes('source:'));
  }
});
