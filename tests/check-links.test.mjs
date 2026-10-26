import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { brokenLinks } from '../scripts/check-links.mjs';

function site(files) {
  const root = mkdtempSync(join(tmpdir(), 'links-'));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}

test('accepts folders, pages, files, anchors and external links', () => {
  const root = site({
    'index.html': '<a href="/about/">a</a><a href="/post">b</a><a href="/blog/x.html#top">c</a><img src="/a.png"><a href="https://example.com/nope">d</a><a href="mailto:a@b.c">e</a>',
    'about/index.html': '',
    'post.html': '',
    'blog/x.html': '',
    'a.png': '',
  });
  assert.deepEqual(brokenLinks(root), []);
});

test('reports a link to a page that does not exist', () => {
  const root = site({ 'index.html': '<a href="/blog/gone.html">x</a><a href="/claude-academy/">y</a>', 'claude-academy/index.html': '' });
  assert.deepEqual(brokenLinks(root), [{ page: '/index.html', link: '/blog/gone.html' }]);
});

test('resolves site-relative links from the page folder', () => {
  const root = site({ 'blog/a.html': '<a href="b.html">ok</a><a href="c.html">bad</a>', 'blog/b.html': '' });
  assert.deepEqual(brokenLinks(root), [{ page: '/blog/a.html', link: 'c.html' }]);
});
