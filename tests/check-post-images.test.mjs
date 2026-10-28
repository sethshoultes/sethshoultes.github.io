import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, cssCapsImages, wideImages } from '../scripts/check-post-images.mjs';

const post = (img) => `<article class="post"><div class="post-content">${img}</div></article>`;
const CSS = '.post-content img { max-width: 100%; height: auto; }';

function site(css, posts) {
  const root = mkdtempSync(join(tmpdir(), 'pi-'));
  mkdirSync(join(root, 'assets')); mkdirSync(join(root, 'blog'));
  writeFileSync(join(root, 'assets/site.css'), css);
  for (const [name, html] of Object.entries(posts)) writeFileSync(join(root, 'blog', name), html);
  return root;
}

test('css rule must cap post images at 100%', () => {
  assert.equal(cssCapsImages(CSS), true);
  assert.equal(cssCapsImages('.post-content img { height: auto; }'), false);
});

test('a bare 1536px image is flagged, a post-img one is not', () => {
  assert.equal(wideImages(post('<img src="/a.png" width="1536" height="1024">')).length, 1);
  assert.deepEqual(wideImages(post('<img src="/a.png" width="1536" class="post-img post-img-lead">')), []);
  assert.deepEqual(wideImages(post('<img src="/a.png" width="600">')), []);
});

test('check passes a clean site and reports a bad post and a missing rule', () => {
  assert.deepEqual(check(site(CSS, { 'a.html': post('<img width="1536" class="post-img">') })), []);
  assert.equal(check(site(CSS, { 'a.html': post('<img width="1536">') })).length, 1);
  assert.equal(check(site('', {})).length, 1);
});
