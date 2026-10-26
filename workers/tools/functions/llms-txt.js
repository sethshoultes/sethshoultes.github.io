// llms.txt generator: finds a site's sitemap, reads the title and description
// of its main pages, and writes a ready-to-upload llms.txt. Every line comes
// from the site's own pages; a page that cannot be read is left out and counted.

import { reply } from './_lib/guard.js';
import { makeSafeFetch, parseTarget } from './_lib/safe-fetch.js';
import { pageInfo } from './_lib/html.js';
import { pickPages } from './_lib/sitemap.js';
import { attempt, findSitemaps, collectUrls } from './_lib/sitemap-fetch.js';

const MAX_PAGES = 20;
const BATCH = 6;
const PAGES_DEADLINE_MS = 45000;

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
