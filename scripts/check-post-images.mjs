// Fail if a blog post image can spill past the 720px text column.
// Run after `jekyll build`:  node scripts/check-post-images.mjs [_site]
// Two rules: assets/site.css must cap `.post-content img` at max-width 100%, and an <img> in a post
// that declares a width over the column must carry the post-img class (width 100%, so it fits).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const COLUMN = 720;

export function cssCapsImages(css) {
  return /\.post-content img\s*\{[^}]*max-width:\s*100%/.test(css);
}

export function wideImages(html) {
  const body = html.split('<div class="post-content">')[1];
  if (!body) return [];
  const bad = [];
  for (const [tag] of body.matchAll(/<img\b[^>]*>/g)) {
    const width = Number((tag.match(/\swidth="(\d+)"/) || [])[1]);
    if (width > COLUMN && !/class="[^"]*\bpost-img\b/.test(tag)) bad.push(tag.slice(0, 120));
  }
  return bad;
}

export function check(root) {
  const problems = [];
  const css = join(root, 'assets/site.css');
  if (!existsSync(css) || !cssCapsImages(readFileSync(css, 'utf8'))) problems.push('assets/site.css has no `.post-content img { max-width: 100% }` rule');
  const dir = join(root, 'blog');
  for (const name of existsSync(dir) ? readdirSync(dir) : []) {
    if (!name.endsWith('.html')) continue;
    for (const tag of wideImages(readFileSync(join(dir, name), 'utf8'))) problems.push(`/blog/${name}: ${tag}`);
  }
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const problems = check(process.argv[2] || '_site');
  if (problems.length) {
    console.error(`Post images that can overflow the ${COLUMN}px column:\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log('ok: post images fit the column');
}
