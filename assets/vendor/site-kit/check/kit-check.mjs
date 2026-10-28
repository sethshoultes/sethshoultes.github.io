// site-kit checker: run on a site's built output.  node vendor/site-kit/check/kit-check.mjs <built-dir> [--config kit.json]
// kit.json: { "stylesheets": ["/assets/site.css"], "skip": ["^arcade/"], "column": 720 }
// Allowed stylesheets are the kit's own (/vendor/site-kit/css/*, /assets/brand.css) plus those listed in kit.json.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const KIT_STYLES = /^\/(?:assets\/vendor\/site-kit\/css\/[\w.-]+|assets\/brand\.css)$/;

export function* htmlFiles(dir, root = dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* htmlFiles(full, root);
    else if (name.endsWith('.html')) yield [full, '/' + relative(root, full).split(sep).join('/')];
  }
}

const tags = (html, name) => [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((m) => m[0]);
const attr = (tag, name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`, 'i')) || [])[1];

export function checkPage(html, url, config = {}) {
  const col = config.column || 720, allowed = new Set(config.stylesheets || []), problems = [];
  const add = (rule, detail) => problems.push(`${url}: [${rule}] ${detail}`);
  if (/<[a-z][^>]*\sstyle="/i.test(html.replace(/<script[\s\S]*?<\/script>/gi, ''))) add('inline-style', 'inline style="" attribute');
  for (const img of tags(html, 'img')) {
    const src = attr(img, 'src') || '';
    if (attr(img, 'alt') === undefined) add('alt', `<img> without alt: ${src}`);
    const width = Number(attr(img, 'width'));
    if (width > col && !/class="[^"]*\bpost-img\b/.test(img) && html.includes('class="post-content"')) add('column', `${width}px image without post-img class: ${src}`);
  }
  for (const link of tags(html, 'link')) {
    if (attr(link, 'rel') !== 'stylesheet' && attr(link, 'rel') !== 'preload') continue;
    const href = attr(link, 'href') || '';
    if (/^https?:/.test(href) || (attr(link, 'rel') === 'preload' && attr(link, 'as') !== 'style')) continue;
    if (!KIT_STYLES.test(href) && !allowed.has(href)) add('stylesheet', `not a kit or listed stylesheet: ${href}`);
  }
  for (const m of html.matchAll(/<a class="link-card"[\s\S]*?<\/a>/g)) {
    const card = m[0];
    if ((card.match(/<h3\b/g) || []).length !== 1) add('link-card', 'a link card needs exactly one <h3>');
    if (card.slice(1).includes('<a ')) add('link-card', 'a link card must not contain another link');
  }
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch { add('schema', 'JSON-LD does not parse'); }
  }
  if (html.includes('class="post-content"') && !/<script type="application\/ld\+json">/.test(html) && config.postSchema) add('schema', 'post has no JSON-LD');
  return problems;
}

export function checkSite(root, config = {}) {
  const skip = (config.skip || []).map((s) => new RegExp(s));
  const out = [];
  for (const [file, url] of htmlFiles(root)) {
    if (skip.some((re) => re.test(url.slice(1)))) continue;
    out.push(...checkPage(readFileSync(file, 'utf8'), url, config));
  }
  return out;
}

// Hash of every file under the vendored directories (css, check, markup and the Jekyll includes).
export function kitHash(dirs) {
  const h = createHash('sha256');
  const walk = (d) => readdirSync(d).sort().forEach((n) => {
    const f = join(d, n);
    if (statSync(f).isDirectory()) walk(f); else h.update(n).update(readFileSync(f));
  });
  [].concat(dirs).forEach(walk);
  return h.digest('hex').slice(0, 16);
}

export function checkLock(vendorDirs, lockFile) {
  if (!existsSync(lockFile)) return [`kit.lock missing (${lockFile})`];
  const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
  return kitHash(vendorDirs) === lock.hash ? [] : [`vendored kit differs from ${lock.tag}: someone edited it by hand. Run scripts/kit-sync.sh ${lock.tag}`];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const cfgPath = opt('--config') || 'kit.json';
  const config = existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, 'utf8')) : {};
  if (args.includes('--hash')) { console.log(kitHash(config.vendor)); process.exit(0); }
  const root = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--config') || '_site';
  const problems = [...checkSite(root, config)];
  if (config.vendor) problems.push(...checkLock(config.vendor, config.lock || 'kit.lock'));
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  console.log('ok: kit checks pass');
}
