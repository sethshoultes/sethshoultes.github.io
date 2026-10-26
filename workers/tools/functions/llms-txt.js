// llms.txt generator: finds a site's sitemap, reads the title and description
// of its main pages, and writes a ready-to-upload llms.txt. Every line comes
// from the site's own pages; a page that cannot be read is left out and counted.

import { reply } from './_lib/guard.js';
import { makeSafeFetch, FetchError, parseTarget } from './_lib/safe-fetch.js';
import { pageInfo } from './_lib/html.js';
import { isIndex, locs, pickPages, sameSite } from './_lib/sitemap.js';

const MAX_PAGES = 20;
const MAX_CHILD_SITEMAPS = 5;
const BATCH = 6;
const MAX_URLS = 50000;
const DEADLINE_MS = 25000;
const PAGES_DEADLINE_MS = 45000;
const MAX_ROBOTS_LINES = 500;

async function attempt(work) {
  try {
    return await work();
  } catch (err) {
    if (err instanceof FetchError) return { error: err.message };
    throw err;
  }
}

async function findSitemaps(safeFetch, origin, host) {
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

// One URL budget and one deadline for every sitemap together, and only addresses
// on the checked site are followed.
async function collectUrls(safeFetch, starts, host, startedAt) {
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

function trimSiteName(title, siteName, hostname) {
  const names = [siteName, hostname.replace(/^www\./, '')].filter(Boolean).map((n) => n.toLowerCase());
  const parts = title.split(/\s+[|–—-]\s+/);
  if (parts.length > 1 && names.some((n) => parts[parts.length - 1].toLowerCase().includes(n))) parts.pop();
  return parts.join(' - ').trim() || title;
}

const oneLine = (text) => text.replace(/\s+/g, ' ').replace(/[[\]]/g, '').trim();

export async function onRequestPost({ data }) {
  let target;
  try {
    target = parseTarget(data.body.url);
  } catch (err) {
    return reply(400, { error: err.message });
  }
  const safeFetch = makeSafeFetch();
  const origin = target.origin;
  const startedAt = Date.now();

  const home = await attempt(() => safeFetch(`${origin}/`, { accept: 'text/html' }));
  if (home.error) return reply(502, { error: `We could not reach ${target.hostname}. ${home.error}` });
  if (home.status >= 400) return reply(502, { error: `${target.hostname} answered ${home.status} for its home page.` });
  const homeInfo = pageInfo(home.text);

  const { urls, read } = await collectUrls(safeFetch, await findSitemaps(safeFetch, origin, target.hostname), target.hostname, startedAt);
  if (!read) return reply(200, { site: origin, error: 'We could not find a sitemap for this site (we looked in robots.txt and at /sitemap.xml), so there is nothing to build a list from. Add a sitemap, then try again.' });
  const candidates = pickPages(urls, target.hostname, MAX_PAGES);
  if (!candidates.length) return reply(200, { site: origin, error: 'The sitemap was found but it lists no pages we can use.' });

  const pages = [];
  for (let i = 0; i < candidates.length && Date.now() - startedAt < PAGES_DEADLINE_MS; i += BATCH) {
    const batch = await Promise.all(candidates.slice(i, i + BATCH).map(async (c) => {
      const res = await attempt(() => safeFetch(c.url, { accept: 'text/html', maxBytes: 200_000, timeoutMs: 5000 }));
      if (res.error || res.status !== 200) return null;
      const info = pageInfo(res.text);
      return info.title ? { ...c, title: trimSiteName(info.title, homeInfo.siteName, target.hostname), description: info.description } : null;
    }));
    pages.push(...batch.filter(Boolean));
  }
  if (!pages.length) return reply(200, { site: origin, error: 'We found a sitemap but could not read any of its pages.' });

  const name = oneLine(homeInfo.siteName || trimSiteName(homeInfo.title || target.hostname, '', target.hostname));
  const line = (p) => `- [${oneLine(p.title)}](${p.url})${p.description ? `: ${oneLine(p.description)}` : ''}`;
  const key = pages.filter((p) => p.depth <= 1);
  const more = pages.filter((p) => p.depth > 1);
  const out = [`# ${name}`, ''];
  if (homeInfo.description) out.push(`> ${oneLine(homeInfo.description)}`, '');
  if (key.length) out.push('## Key pages', ...key.map(line), '');
  if (more.length) out.push('## More', ...more.map(line), '');

  return reply(200, {
    site: origin,
    sitemap: read,
    llms: out.join('\n').trimEnd() + '\n',
    counts: { sitemapUrls: urls.length, listed: pages.length, skipped: candidates.length - pages.length },
    homeDescription: Boolean(homeInfo.description),
  });
}
