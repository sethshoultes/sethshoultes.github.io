// Finds a site's sitemap(s) and collects their page addresses. One URL budget and
// one deadline cover every sitemap together, and only addresses on the checked
// site are followed. A fetch that fails is skipped, not guessed at.

import { FetchError } from './safe-fetch.js';
import { isIndex, locs, sameSite } from './sitemap.js';

const MAX_CHILD_SITEMAPS = 5;
const MAX_URLS = 50000;
const DEADLINE_MS = 25000;
const MAX_ROBOTS_LINES = 500;

export async function attempt(work) {
  try {
    return await work();
  } catch (err) {
    if (err instanceof FetchError) return { error: err.message };
    throw err;
  }
}

export async function findSitemaps(safeFetch, origin, host) {
  const robots = await attempt(() => safeFetch(`${origin}/robots.txt`, { accept: 'text/plain', maxBytes: 500_000 }));
  const listed = [];
  if (!robots.error) {
    for (const line of robots.text.split(/\r?\n/, MAX_ROBOTS_LINES)) {
      const m = /^[ \t]*sitemap[ \t]*:[ \t]*(\S+)/i.exec(line);
      if (m && sameSite(m[1], host)) listed.push(m[1]);
    }
  }
  return listed.length ? listed.slice(0, MAX_CHILD_SITEMAPS) : [`${origin}/sitemap.xml`];
}

export async function collectUrls(safeFetch, starts, host, startedAt) {
  const urls = [];
  let read = null;
  const room = () => urls.length < MAX_URLS && Date.now() - startedAt < DEADLINE_MS;
  const take = (list) => { for (const u of list) { if (urls.length >= MAX_URLS) break; urls.push(u); } };
  for (const start of starts) {
    if (!room()) break;
    const res = await attempt(() => safeFetch(start, { accept: 'application/xml,text/xml', maxBytes: 3_000_000 }));
    if (res.error || res.status !== 200 || !/<(urlset|sitemapindex)\b/i.test(res.text)) continue;
    read = read || start;
    if (!isIndex(res.text)) { take(locs(res.text)); continue; }
    for (const child of locs(res.text).filter((c) => sameSite(c, host)).slice(0, MAX_CHILD_SITEMAPS)) {
      if (!room()) break;
      const c = await attempt(() => safeFetch(child, { accept: 'application/xml,text/xml', maxBytes: 3_000_000 }));
      if (!c.error && c.status === 200 && !isIndex(c.text)) take(locs(c.text));
    }
  }
  return { urls, read };
}

