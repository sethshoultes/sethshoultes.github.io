// Fail if a built page embeds a YouTube video that is private, deleted or otherwise unavailable.
// Run after `jekyll build`:  node scripts/check-youtube.mjs [_site]
// Asks YouTube's oEmbed endpoint about every embedded video id: 401, 403 and 404 mean the video
// shows "Video unavailable" to visitors, so they fail the check. Network errors, 429 and 5xx only
// warn: a flaky network must not block a merge.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP = /^(advanced-typing-games|game-center|typing-games|garage-door-science-hub|data|build|docs|admin|wordpress-plugins|ops|workers|scripts|arcade|html5)\//;
const DEAD = new Set([401, 403, 404]);

function* pages(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* pages(full);
    else if (name.endsWith('.html')) yield full;
  }
}

export function embeddedIds(html) {
  const ids = new Set();
  for (const m of html.matchAll(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/g)) ids.add(m[1]);
  return ids;
}

export function collect(root) {
  const byId = new Map();
  for (const file of pages(root)) {
    const rel = relative(root, file).split(sep).join('/');
    if (SKIP.test(rel)) continue;
    for (const id of embeddedIds(readFileSync(file, 'utf8'))) byId.set(id, [...(byId.get(id) || []), '/' + rel]);
  }
  return byId;
}

export async function check(root, fetchStatus) {
  const failures = [], warnings = [];
  for (const [id, where] of collect(root)) {
    let status;
    try { status = await fetchStatus(id); } catch (e) { warnings.push(`${id}: ${e.message} (${where.join(', ')})`); continue; }
    if (DEAD.has(status)) failures.push(`${id} -> HTTP ${status} (${where.join(', ')})`);
    else if (status !== 200) warnings.push(`${id} -> HTTP ${status}, not checked (${where.join(', ')})`);
  }
  return { failures, warnings };
}

const oembed = async (id) => (await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`)).status;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { failures, warnings } = await check(process.argv[2] || '_site', oembed);
  warnings.forEach((w) => console.warn(`warn: ${w}`));
  if (failures.length) {
    console.error(`${failures.length} embedded YouTube video(s) unavailable to visitors (private, deleted or blocked). Swap or remove the embed:`);
    failures.forEach((f) => console.error(`  ${f}`));
    process.exit(1);
  }
  console.log('ok: every embedded YouTube video is available');
}
