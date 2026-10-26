// Fail if a page in the built site links to an internal page or file that does not exist.
// Run after `jekyll build`:  node scripts/check-links.mjs [_site]
// Checks href and src values that start with "/" or are site-relative. External links, mailto:,
// tel: and #anchors are skipped, as are the games, vendored builds and sub-sites that keep
// their own paths (same list as scripts/check-inline-styles.sh).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP = /^(advanced-typing-games|game-center|typing-games|garage-door-science-hub|data|build|docs|admin|wordpress-plugins|ops|workers|scripts|arcade|html5)\//;

function* pages(dir, root) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* pages(full, root);
    else if (name.endsWith('.html')) yield full;
  }
}

function exists(root, urlPath) {
  const p = join(root, decodeURIComponent(urlPath));
  if (urlPath.endsWith('/')) return existsSync(join(p, 'index.html'));
  if (existsSync(p) && statSync(p).isFile()) return true;
  return existsSync(`${p}.html`) || existsSync(join(p, 'index.html'));
}

export function brokenLinks(root) {
  const broken = [];
  for (const file of pages(root, root)) {
    const rel = relative(root, file).split(sep).join('/');
    if (SKIP.test(rel)) continue;
    const page = '/' + rel;
    const html = readFileSync(file, 'utf8');
    for (const m of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      const raw = m[1].trim();
      if (/^(#|[a-z][a-z0-9+.-]*:|\/\/|\{)/i.test(raw)) continue;
      const clean = raw.split('#')[0].split('?')[0];
      if (!clean) continue;
      const target = clean.startsWith('/') ? clean : posix.join(posix.dirname(page), clean);
      if (!exists(root, target)) broken.push({ page, link: raw });
    }
  }
  return broken;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] || '_site';
  const broken = brokenLinks(root);
  if (broken.length) {
    console.error(`${broken.length} broken internal link(s). Fix the link or add redirect_from to the live page:`);
    for (const b of broken) console.error(`  ${b.page} -> ${b.link}`);
    process.exit(1);
  }
  console.log('ok: no broken internal links');
}
