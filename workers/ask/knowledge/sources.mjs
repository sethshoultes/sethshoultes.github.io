// What "Seth's AI" may know (#172): the published blog posts, and brain notes that say
// `public: true` in their front matter. Nothing else is ever read. The brain loader is
// deliberately strict: a note with no front matter, or public: false, or "public: yes",
// is skipped, and tests/ask-server.test.mjs proves a private note never comes through.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';

export function frontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) return { data: {}, body: text };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) data[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return { data, body: m[2] };
}

export function htmlToText(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li|blockquote|pre|tr)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'").replace(/&mdash;/g, '-')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

// The site's published posts: /blog/<slug>.html, where the slug is the file name after the date.
export function loadPosts(dir, siteUrl = 'https://sethshoultes.com') {
  return readdirSync(dir).filter((n) => /\.(html|md)$/.test(n)).map((n) => {
    const { data, body } = frontMatter(readFileSync(join(dir, n), 'utf8'));
    const slug = basename(n, extname(n)).replace(/^\d{4}-\d{2}-\d{2}-/, '');
    return { id: `post:${slug}`, title: data.title || slug, url: `${siteUrl}/blog/${slug}.html`, text: htmlToText(body) };
  }).filter((d) => d.text.length > 200);
}

// Brain notes: only those that opt in with `public: true`. Anything else is invisible to this code.
export function loadBrain(dir, siteUrl = 'https://sethshoultes.com') {
  const out = [];
  for (const file of walk(dir)) {
    if (!file.endsWith('.md')) continue;
    const { data, body } = frontMatter(readFileSync(file, 'utf8'));
    if (data.public !== 'true') continue;
    const slug = basename(file, '.md').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    out.push({ id: `note:${slug}`, title: data.title || basename(file, '.md'), url: data.url || `${siteUrl}/talk/`, text: body.trim() });
  }
  return out.filter((d) => d.text.length > 100);
}

// Split a document into passages of roughly `size` characters on paragraph edges.
export function chunk(text, size = 900) {
  const out = [];
  let cur = '';
  for (const para of text.split(/\n{2,}/)) {
    if (cur && cur.length + para.length > size) { out.push(cur.trim()); cur = ''; }
    cur += `${para}\n\n`;
    while (cur.length > size * 1.6) { out.push(cur.slice(0, size).trim()); cur = cur.slice(size); }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function toChunks(docs) {
  return docs.flatMap((d) => chunk(d.text).map((text, i) => ({ id: `${d.id}#${i}`, title: d.title, url: d.url, text })));
}
