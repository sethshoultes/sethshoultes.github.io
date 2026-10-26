import test from 'node:test';
import assert from 'node:assert/strict';

import { guard, ALLOWED_ORIGIN } from '../workers/tools/functions/_lib/guard.js';
import { parseTarget, isPrivateIp, makeSafeFetch, FetchError } from '../workers/tools/functions/_lib/safe-fetch.js';
import { parseRobots, evaluate } from '../workers/tools/functions/_lib/robots.js';
import { jsonLdTypes, markdownAlternate } from '../workers/tools/functions/_lib/html.js';

class FakeKV {
  constructor() { this.data = new Map(); }
  async get(k) { return this.data.get(k) ?? null; }
  async put(k, v) { this.data.set(k, v); }
}

function request(body, { origin = ALLOWED_ORIGIN, ip = '203.0.113.7', method = 'POST', path = '/crawler-check' } = {}) {
  const headers = { 'CF-Connecting-IP': ip };
  if (origin) headers.Origin = origin;
  return new Request(`https://tools-api.sethshoultes.com${path}`, {
    method,
    headers,
    body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
}

test('guard: refuses a wrong origin, a GET, bad JSON and an unknown tool', async () => {
  const env = { TOOLS_KV: new FakeKV() };
  assert.equal((await guard(request({ url: 'a.com' }, { origin: 'https://evil.example' }), env)).response.status, 403);
  assert.equal((await guard(request({}, { method: 'GET' }), env)).response.status, 405);
  assert.equal((await guard(request('not json'), env)).response.status, 400);
  assert.equal((await guard(request({}, { path: '/nope' }), env)).response.status, 404);
});

test('guard: honeypot answers ok without counting', async () => {
  const kv = new FakeKV();
  const r = await guard(request({ url: 'a.com', website: 'spam' }), { TOOLS_KV: kv });
  assert.equal(r.response.status, 200);
  assert.equal(kv.data.size, 0);
});

test('guard: no KV binding fails closed', async () => {
  assert.equal((await guard(request({ url: 'a.com' }), {})).response.status, 503);
});

test('guard: per-IP hourly limit, then a different IP still passes', async () => {
  const env = { TOOLS_KV: new FakeKV() };
  const now = new Date('2026-10-26T01:00:00Z');
  for (let i = 0; i < 10; i += 1) assert.ok((await guard(request({ url: 'a.com' }), env, now)).body);
  assert.equal((await guard(request({ url: 'a.com' }), env, now)).response.status, 429);
  assert.ok((await guard(request({ url: 'a.com' }, { ip: '198.51.100.9' }), env, now)).body);
  const nextHour = new Date('2026-10-26T02:00:00Z');
  assert.ok((await guard(request({ url: 'a.com' }), env, nextHour)).body);
});

test('guard: the daily cap stops everyone', async () => {
  const kv = new FakeKV();
  kv.data.set('day:crawler-check:2026-10-26', '500');
  const r = await guard(request({ url: 'a.com' }), { TOOLS_KV: kv }, new Date('2026-10-26T05:00:00Z'));
  assert.equal(r.response.status, 429);
  assert.match((await r.response.json()).error, /tomorrow/);
});

test('parseTarget: accepts public names, adds https', () => {
  assert.equal(parseTarget('example.com').href, 'https://example.com/');
  assert.equal(parseTarget(' http://www.example.com/page ').hostname, 'www.example.com');
});

test('parseTarget: refuses numbers, internal names, ports, credentials and other schemes', () => {
  for (const bad of ['127.0.0.1', 'http://10.0.0.1/', 'localhost', 'router.local', 'http://[::1]/', 'ftp://example.com', 'https://a.com:8443', 'https://user:pw@a.com', 'http://2130706433', 'http://0x7f000001', '', 'intranet']) {
    assert.throws(() => parseTarget(bad), FetchError, bad);
  }
});

test('isPrivateIp', () => {
  for (const ip of ['10.1.2.3', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) assert.ok(isPrivateIp(ip), ip);
  for (const ip of ['93.184.216.34', '8.8.8.8', '2606:4700::1111']) assert.ok(!isPrivateIp(ip), ip);
});

const page = (body, init = {}) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/html' }, ...init });

test('safeFetch: refuses a name that resolves to a private address', async () => {
  const safeFetch = makeSafeFetch({ resolve: async () => ['10.0.0.5'], fetch: async () => { throw new Error('should not fetch'); } });
  await assert.rejects(safeFetch('https://sneaky.example.com/'), /not a public website/);
});

test('safeFetch: re-checks every redirect hop', async () => {
  const resolve = async (h) => (h === 'internal.example.com' ? ['192.168.0.9'] : ['93.184.216.34']);
  const fetchStub = async () => new Response(null, { status: 302, headers: { Location: 'https://internal.example.com/secret' } });
  await assert.rejects(makeSafeFetch({ resolve, fetch: fetchStub })('https://a.example.com/'), /not a public website/);
});

test('safeFetch: stops after too many redirects and caps the body', async () => {
  const resolve = async () => ['93.184.216.34'];
  const loop = async () => new Response(null, { status: 301, headers: { Location: 'https://a.example.com/' } });
  await assert.rejects(makeSafeFetch({ resolve, fetch: loop })('https://a.example.com/'), /too many times/);
  const big = async () => page('x'.repeat(5000));
  const res = await makeSafeFetch({ resolve, fetch: big })('https://a.example.com/', { maxBytes: 1000 });
  assert.equal(res.text.length, 1000);
  assert.equal(res.truncated, true);
});

const ROBOTS = `
User-agent: *
Disallow: /admin/
Disallow: /private

User-agent: GPTBot
User-agent: ClaudeBot
Disallow: /

User-agent: PerplexityBot
Allow: /
Disallow: /drafts/ # comment
`;

test('robots: specific group beats *, shared groups work, partial is reported', () => {
  const groups = parseRobots(ROBOTS);
  assert.equal(evaluate(groups, 'GPTBot').status, 'blocked');
  assert.equal(evaluate(groups, 'ClaudeBot').status, 'blocked');
  assert.deepEqual(evaluate(groups, 'ClaudeBot').rules, ['Disallow: /']);
  const p = evaluate(groups, 'PerplexityBot');
  assert.equal(p.status, 'partial');
  assert.deepEqual(p.rules, ['Disallow: /drafts/']);
  const g = evaluate(groups, 'Google-Extended');
  assert.equal(g.group, 'star');
  assert.equal(g.status, 'partial');
});

test('robots: no rules means allowed; Allow beats Disallow on a tie; wildcards and $', () => {
  assert.equal(evaluate(parseRobots(''), 'GPTBot').status, 'allowed');
  assert.equal(evaluate(parseRobots('User-agent: GPTBot\nAllow: /\nDisallow: /'), 'GPTBot').status, 'allowed');
  assert.equal(evaluate(parseRobots('User-agent: *\nDisallow: /*'), 'GPTBot').status, 'blocked');
  assert.equal(evaluate(parseRobots('User-agent: *\nDisallow: /$'), 'GPTBot').status, 'blocked');
  assert.equal(evaluate(parseRobots('User-agent: *\nDisallow:'), 'GPTBot').status, 'allowed');
});

test('html: JSON-LD types from blocks and @graph, invalid blocks counted', () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Person"},{"@type":["Service","Thing"]}]}</script>
  <script type='application/ld+json'>{broken</script>`;
  const r = jsonLdTypes(html);
  assert.deepEqual(r.types.sort(), ['Person', 'Service', 'Thing']);
  assert.equal(r.blocks, 2);
  assert.equal(r.invalid, 1);
});

test('html: markdown alternate link', () => {
  assert.equal(markdownAlternate('<link href="/a.md" type="text/markdown" rel="alternate">'), '/a.md');
  assert.equal(markdownAlternate('<link rel="stylesheet" href="/a.css">'), null);
});

test('crawler-check handler: end to end with a stubbed network', async () => {
  const realFetch = globalThis.fetch;
  const site = {
    'https://example.com/robots.txt': new Response(ROBOTS, { headers: { 'Content-Type': 'text/plain' } }),
    'https://example.com/llms.txt': new Response('# Example\n> A site', { headers: { 'Content-Type': 'text/plain' } }),
    'https://example.com/': null,
    'https://example.com/index.md': new Response('nope', { status: 404 }),
  };
  const home = '<html><head><link rel="alternate" type="text/markdown" href="/home.md"><script type="application/ld+json">{"@type":"Organization"}</script></head></html>';
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith('https://cloudflare-dns.com/')) {
      return Response.json({ Answer: url.includes('type=A&') || url.endsWith('type=A') ? [{ type: 1, data: '93.184.216.34' }] : [] });
    }
    if (url === 'https://example.com/') return new Response(home, { headers: { 'Content-Type': 'text/html' } });
    return (site[url] || new Response('', { status: 404 })).clone();
  };
  try {
    const { onRequestPost } = await import('../workers/tools/functions/crawler-check.js');
    const res = await onRequestPost({ data: { body: { url: 'example.com' } } });
    const out = await res.json();
    assert.equal(res.status, 200);
    assert.equal(out.site, 'https://example.com');
    assert.equal(out.robots.state, 'found');
    assert.deepEqual(out.robots.bots.map((b) => [b.name, b.status]), [['GPTBot', 'blocked'], ['ClaudeBot', 'blocked'], ['PerplexityBot', 'partial'], ['Google-Extended', 'partial']]);
    assert.equal(out.llms.state, 'found');
    assert.equal(out.markdown.state, 'found');
    assert.deepEqual(out.jsonld.types, ['Organization']);
    const bad = await onRequestPost({ data: { body: { url: '127.0.0.1' } } });
    assert.equal(bad.status, 400);
  } finally {
    globalThis.fetch = realFetch;
  }
});

import { pickPages, locs, isIndex } from '../workers/tools/functions/_lib/sitemap.js';
import { pageInfo, decodeEntities } from '../workers/tools/functions/_lib/html.js';

test('sitemap: locs, index detection, CDATA and entities', () => {
  const xml = '<urlset><url><loc>https://a.com/x?a=1&amp;b=2</loc></url><url><loc><![CDATA[https://a.com/y]]></loc></url></urlset>';
  assert.deepEqual(locs(xml), ['https://a.com/x?a=1&b=2', 'https://a.com/y']);
  assert.ok(isIndex('<sitemapindex></sitemapindex>'));
  assert.ok(!isIndex(xml));
});

test('sitemap: pickPages keeps same-site content, shallowest first, drops noise and duplicates', () => {
  const urls = [
    'https://www.a.com/blog/post-1/', 'https://a.com/', 'https://a.com/about/', 'https://a.com/about', 'https://b.com/other/',
    'https://a.com/tag/news/', 'https://a.com/blog/page/2', 'https://a.com/files/menu.pdf', 'https://a.com/services/', 'https://a.com/search?q=x',
  ];
  assert.deepEqual(pickPages(urls, 'a.com', 10).map((p) => p.url), ['https://a.com/about/', 'https://a.com/services/', 'https://www.a.com/blog/post-1/']);
  assert.equal(pickPages(urls, 'a.com', 1).length, 1);
});

test('html: pageInfo reads title, description and site name, decodes entities', () => {
  const html = `<html><head><title>Plumbing &amp; Drains | Red Rock</title>
  <meta name="description" content="Fast   repairs &#39;n more">
  <meta property="og:site_name" content="Red Rock Plumbing"></head></html>`;
  assert.deepEqual(pageInfo(html), { title: 'Plumbing & Drains | Red Rock', description: "Fast repairs 'n more", siteName: 'Red Rock Plumbing' });
  assert.equal(decodeEntities('&lt;b&gt; &unknown;'), '<b> &unknown;');
});

test('llms-txt handler: builds the file from a stubbed site, skips unreadable pages', async () => {
  const realFetch = globalThis.fetch;
  const html = (title, desc) => new Response(`<head><title>${title}</title>${desc ? `<meta name="description" content="${desc}">` : ''}<meta property="og:site_name" content="Red Rock Plumbing"></head>`, { headers: { 'Content-Type': 'text/html' } });
  const routes = {
    'https://example.com/': () => html('Red Rock Plumbing', 'Family plumber in St. George.'),
    'https://example.com/robots.txt': () => new Response('Sitemap: https://example.com/sitemap.xml', { headers: { 'Content-Type': 'text/plain' } }),
    'https://example.com/sitemap.xml': () => new Response('<urlset><url><loc>https://example.com/</loc></url><url><loc>https://example.com/services/</loc></url><url><loc>https://example.com/about/</loc></url><url><loc>https://example.com/blog/leaks/</loc></url></urlset>', { headers: { 'Content-Type': 'application/xml' } }),
    'https://example.com/services/': () => html('Services | Red Rock Plumbing', 'Drains, heaters and leaks.'),
    'https://example.com/about/': () => new Response('gone', { status: 404 }),
    'https://example.com/blog/leaks/': () => html('Finding a leak', ''),
  };
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith('https://cloudflare-dns.com/')) return Response.json({ Answer: /type=A$/.test(url) ? [{ type: 1, data: '93.184.216.34' }] : [] });
    return (routes[url] || (() => new Response('', { status: 404 })))();
  };
  try {
    const { onRequestPost } = await import('../workers/tools/functions/llms-txt.js');
    const out = await (await onRequestPost({ data: { body: { url: 'example.com' } } })).json();
    assert.equal(out.llms, [
      '# Red Rock Plumbing', '', '> Family plumber in St. George.', '',
      '## Key pages', '- [Services](https://example.com/services/): Drains, heaters and leaks.', '',
      '## More', '- [Finding a leak](https://example.com/blog/leaks/)', '',
    ].join('\n'));
    assert.deepEqual(out.counts, { sitemapUrls: 4, listed: 2, skipped: 1 });
    routes['https://example.com/robots.txt'] = () => new Response('', { status: 404 });
    routes['https://example.com/sitemap.xml'] = () => new Response('', { status: 404 });
    const none = await (await onRequestPost({ data: { body: { url: 'example.com' } } })).json();
    assert.match(none.error, /could not find a sitemap/);
    assert.equal(none.llms, undefined);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('isPrivateIp: only global unicast IPv6 is public, in any notation', () => {
  for (const ip of ['::', '::1', '::ffff:a00:1', '::ffff:10.0.0.1', '64:ff9b::a00:1', '2002:a00:1::1', '2001:0:4136:e378::1', '2001:db8::1', 'fec0::1', 'fe80::1', 'fc00::1', 'not-an-ip', '1:2:3']) assert.ok(isPrivateIp(ip), ip);
  for (const ip of ['2606:4700:4700::1111', '2a00:1450:4001:81b::200e', '2001:4860:4860::8888']) assert.ok(!isPrivateIp(ip), ip);
});

test('html and sitemap scans stay fast on hostile input', () => {
  const big = 1_000_000;
  const started = Date.now();
  for (const html of ['<meta '.repeat(big / 6), '<script type="application/ld+json" '.repeat(big / 34), '<title'.repeat(big / 6), '<link rel=alternate '.repeat(big / 20)]) {
    pageInfo(html); jsonLdTypes(html); markdownAlternate(html);
  }
  locs('<loc>' + ' '.repeat(3_000_000) + '</loc>');
  locs('<loc>'.repeat(600_000));
  assert.ok(Date.now() - started < 3000, `took ${Date.now() - started}ms`);
});

import { sameSite } from '../workers/tools/functions/_lib/sitemap.js';

test('llms-txt: sitemap and robots input is bounded and stays on the site', async () => {
  assert.ok(sameSite('https://www.a.com/sitemap.xml', 'a.com'));
  assert.ok(!sameSite('https://evil.example/sitemap.xml', 'a.com'));
  assert.ok(!sameSite('not a url', 'a.com'));
  assert.equal(locs(`<loc>https://a.com/${'x'.repeat(5000)}</loc><loc>https://a.com/ok</loc>`).length, 1);
  assert.equal(locs('<loc>https://a.com/p</loc>'.repeat(60000)).length, 50000);

  const realFetch = globalThis.fetch;
  const asked = [];
  const hostile = 'Sitemap:'.repeat(100000) + '\n' + ' '.repeat(400000) + '\nSitemap: https://evil.example/s.xml\nSitemap: https://a.com/s.xml\n';
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith('https://cloudflare-dns.com/')) return Response.json({ Answer: /type=A$/.test(url) ? [{ type: 1, data: '93.184.216.34' }] : [] });
    asked.push(url);
    if (url.endsWith('/robots.txt')) return new Response(hostile, { headers: { 'Content-Type': 'text/plain' } });
    if (url === 'https://a.com/s.xml') return new Response('<sitemapindex><sitemap><loc>https://evil.example/c.xml</loc></sitemap></sitemapindex>', { headers: { 'Content-Type': 'application/xml' } });
    return new Response('<head><title>A</title></head>', { headers: { 'Content-Type': 'text/html' } });
  };
  try {
    const { onRequestPost } = await import('../workers/tools/functions/llms-txt.js');
    const started = Date.now();
    await onRequestPost({ data: { body: { url: 'a.com' } } });
    assert.ok(Date.now() - started < 3000, `took ${Date.now() - started}ms`);
    assert.ok(!asked.some((u) => u.includes('evil.example')), 'never fetches another host');
  } finally {
    globalThis.fetch = realFetch;
  }
});

import { splitAnswer, isNamed, isSame, isGenericName } from '../workers/tools/functions/_lib/names.js';

test('names: splitAnswer takes the NAMES line out of the prose', () => {
  const r = splitAnswer('Top picks:\n1. **Red Rock Plumbing**\n\nNAMES: **Red Rock Plumbing** | [Marlin](https://x.com) | S&S Mechanical');
  assert.deepEqual(r.names, ['Red Rock Plumbing', 'Marlin', 'S&S Mechanical']);
  assert.ok(!/NAMES/.test(r.prose));
  assert.equal(splitAnswer('Only prose').names, null);
});

test('names: "named" is whole-name equality against the assistant\'s own list (the three review cases)', () => {
  // Answer lists: "St George Plumbing Pros", "Red Rock Plumbing", "ABC Plumbing and Heating".
  const list = ['St George Plumbing Pros', 'Red Rock Plumbing', 'ABC Plumbing and Heating'];
  assert.equal(isNamed('Plumbing', list), false, 'a generic one-word name does not match every plumber');
  assert.equal(isNamed('St George Plumbing', list), false, 'a different business with a longer name');
  assert.equal(isNamed('ABC', list), false, 'a prefix of another name');
  assert.equal(isNamed('Zion Plumbing', list), false);
  assert.equal(isNamed('Red Rock Plumbing, LLC', list), true, 'same name, LLC and punctuation ignored');
  assert.equal(isNamed('ABC Plumbing & Heating', list), true, '& and "and" are the same');
  assert.equal(isNamed('Red Rock Plumbing', null), null, 'no list means we cannot tell');
  assert.ok(isSame('Marlin Plumbing', 'marlin plumbing llc'));
  assert.ok(isSame('The Red Rock Plumbing', 'Red Rock Plumbing'));
  assert.ok(!isSame('Marlin Plumbing', 'Marlin Plumbing Services'));
});

test('names: a name made only of generic words is refused', () => {
  assert.ok(isGenericName('Plumbing', 'plumber', 'St. George, Utah'));
  assert.ok(isGenericName('St. George Utah LLC', 'plumber', 'St. George, Utah'));
  assert.ok(isGenericName('The Plumbers', 'plumber', 'Ogden'));
  assert.ok(isGenericName('Utah, Inc.', 'roofer', 'Provo, Utah'));
  assert.ok(!isGenericName('Red Rock Plumbing', 'plumber', 'St. George, Utah'));
  assert.ok(!isGenericName('ABC', 'plumber', 'St. George, Utah'));
});

test('ai-knows-you handler: named, not named, cannot tell, failed; generic and bad input refused', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const q = JSON.parse(init.body);
    assert.ok(!/Red Rock/.test(JSON.stringify(q)), 'the business name must not be sent to the models');
    if (url.includes('openai.com')) return Response.json({ output: [{ type: 'message', content: [{ text: 'Try Red Rock Plumbing.\nNAMES: Red Rock Plumbing | Marlin Plumbing' }] }] });
    if (url.includes('openrouter.ai')) return Response.json({ choices: [{ message: { content: 'Red Rock Plumbing Pros is best, then Marlin.' } }] });
    return new Response('{}', { status: 500 });
  };
  try {
    const { onRequestPost } = await import('../workers/tools/functions/ai-knows-you.js');
    const env = { OPENAI_API_KEY: 'k', OPENROUTER_API_KEY: 'k', GEMINI_API_KEY: 'k' };
    const ask = (business, e = env) => onRequestPost({ env: e, data: { body: { business, service: 'plumber', city: 'St. George' } } });
    const out = await (await ask('Red Rock Plumbing')).json();
    const by = Object.fromEntries(out.results.map((r) => [r.id, r]));
    assert.equal(by.chatgpt.named, true);
    assert.deepEqual(by.chatgpt.others, ['Marlin Plumbing']);
    assert.equal(by.perplexity.named, null, 'prose that merely contains the name is not a verdict');
    assert.equal(by.perplexity.others, null);
    assert.equal(by.google.state, 'failed');

    const other = await (await ask('Red Rock')).json();
    assert.equal(other.results.find((r) => r.id === 'chatgpt').named, false, 'a shorter name is not the listed business');

    const generic = await ask('Plumbing');
    assert.equal(generic.status, 400);
    assert.match((await generic.json()).error, /too general/);
    assert.equal((await ask('<script>')).status, 400);
    assert.equal((await ask('Red Rock', {})).status, 502);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('neighborhood-planner: city step finds the city (not the county); join step ranks, reports gaps, rejects bad lists', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('nominatim')) return Response.json([
      { osm_type: 'relation', osm_id: 1744372, class: 'boundary', type: 'administrative', addresstype: 'county', display_name: 'Washington County, Utah, United States' },
      { osm_type: 'relation', osm_id: 198783, class: 'boundary', type: 'administrative', addresstype: 'city', display_name: 'Washington, Washington County, Utah, 84780, United States' },
    ]);
    if (url.includes('overpass')) throw new Error('the Worker must not call Overpass');
    if (url.includes('geocoding.geo.census.gov')) {
      const y = new URL(url).searchParams.get('y');
      if (y === '37.3') return Response.json({ result: { geographies: { 'Census Tracts': [] } } });
      const tract = y === '37.1' ? '000100' : '000200';
      return Response.json({ result: { geographies: { 'Census Tracts': [{ STATE: '49', COUNTY: '053', TRACT: tract, NAME: `Census Tract ${tract}` }] } } });
    }
    if (url.includes('censusreporter')) return Response.json({ release: { name: 'ACS 2024 5-year' }, data: {
      '14000US49053000100': { B25035: { estimate: { B25035001: 1975 } }, B25001: { estimate: { B25001001: 2000 } }, B25077: { estimate: { B25077001: 300000 } } },
      '14000US49053000200': { B25035: { estimate: { B25035001: 2015 } }, B25001: { estimate: { B25001001: 4000 } }, B25077: { estimate: { B25077001: null } } },
    } });
    throw new Error('unexpected ' + url);
  };
  try {
    const { onRequestPost } = await import('../workers/tools/functions/neighborhood-planner.js');
    const city = await (await onRequestPost({ data: { body: { city: 'Washington, Utah' } } })).json();
    assert.deepEqual(city, { city: 'Washington, Washington County', osmId: 198783 });

    const hoods = [{ name: 'Old Town', lat: 37.1, lon: -113.5 }, { name: 'New Estates', lat: 37.2, lon: -113.4 }, { name: 'Nowhere', lat: 37.3, lon: -113.3 }, { name: 'old town', lat: 37.1, lon: -113.5 }];
    const out = await (await onRequestPost({ data: { body: { step: 'join', city: 'Washington, Utah', neighborhoods: hoods } } })).json();
    assert.deepEqual(out.neighborhoods.map((n) => n.name), ['Old Town', 'New Estates', 'Nowhere']);
    assert.equal(out.neighborhoods[0].medianYearBuilt, 1975);
    assert.equal(out.neighborhoods[1].medianValue, null);
    assert.equal(out.neighborhoods[2].tract, null);
    assert.equal(out.unmatched, 1);
    assert.equal(out.sources.census, 'ACS 2024 5-year');

    const join = (neighborhoods) => onRequestPost({ data: { body: { step: 'join', city: 'X', neighborhoods } } });
    assert.equal((await join([])).status, 400);
    assert.equal((await join('nope')).status, 400);
    assert.equal((await join([{ name: 'A', lat: 0, lon: 0 }])).status, 400);
    assert.equal((await join([{ name: 'A'.repeat(200), lat: 37, lon: -113 }])).status, 400);
    assert.equal((await join(Array.from({ length: 41 }, (_, i) => ({ name: `N${i}`, lat: 37, lon: -113 })))).status, 400);
    assert.equal((await onRequestPost({ data: { body: { city: '<x>' } } })).status, 400);

    globalThis.fetch = async (input) => (String(input).includes('nominatim') ? Response.json([]) : Response.json({}));
    const none = await onRequestPost({ data: { body: { city: 'Nowhereville, Utah' } } });
    assert.equal(none.status, 502);
    assert.match((await none.json()).error, /could not find that city/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

import { readJson, placesFrom } from '../workers/tools/functions/_lib/maps.js';

test('maps: readJson reads fenced and bare JSON, placesFrom keeps only real place chunks', () => {
  assert.deepEqual(readJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(readJson('Here you go: [{"a":1}]'), [{ a: 1 }]);
  assert.equal(readJson('no json here'), null);
  const places = placesFrom({ groundingChunks: [
    { maps: { uri: 'https://maps.google.com/maps?cid=1', title: 'Walker Plumbing - Google Maps', placeId: 'P1' } },
    { maps: { uri: 'https://www.google.com/maps/reviews/data=x', title: 'Review of Walker Plumbing - Google Maps', placeId: 'P1' } },
    { maps: { uri: 'https://evil.example/', title: 'Crystal Clear Plumbing - Google Maps', placeId: 'P2' } },
    { web: { uri: 'https://x.com', title: 'x' } },
  ] });
  assert.deepEqual(places.map((p) => [p.placeId, p.name, p.url]), [['P1', 'Walker Plumbing', 'https://maps.google.com/maps?cid=1'], ['P2', 'Crystal Clear Plumbing', null]]);
});

function mapsFetch({ profileReply, competitorReply, profilePlaces, competitorPlaces }) {
  return async (input, init) => {
    const url = String(input);
    if (url.includes('nominatim')) return Response.json([{ osm_type: 'relation', osm_id: 198783, class: 'boundary', type: 'administrative', addresstype: 'city', display_name: 'St. George, Washington County, Utah, United States' }]);
    if (url.includes('generativelanguage.googleapis.com')) {
      const prompt = JSON.parse(init.body).contents[0].parts[0].text;
      const isProfile = /Find the Google Maps listing/.test(prompt);
      const chunks = (isProfile ? profilePlaces : competitorPlaces).map((p, i) => ({ maps: { uri: `https://maps.google.com/maps?cid=${i}`, title: `${p} - Google Maps`, placeId: `${isProfile ? 'A' : 'B'}${i}` } }));
      return Response.json({ candidates: [{ content: { parts: [{ text: isProfile ? profileReply : competitorReply }] }, groundingMetadata: { groundingChunks: chunks } }] });
    }
    throw new Error('unexpected ' + url);
  };
}

test('local-seo-audit lookup: found listing, grounded competitors, traps refused', async () => {
  const realFetch = globalThis.fetch;
  try {
    const { onRequestPost } = await import('../workers/tools/functions/local-seo-audit.js');
    const run = (business, fetchImpl, env = { GEMINI_API_KEY: 'k' }) => {
      globalThis.fetch = fetchImpl;
      return onRequestPost({ env, data: { body: { business, service: 'plumber', city: 'St. George, Utah' } } });
    };
    const competitors = '```json\n[{"name":"Walker Plumbing, Heating & Air","rating":4.8,"reviews":2209},{"name":"Crystal Clear Plumbing","rating":4.9,"reviews":507},{"name":"Made Up Plumbing","rating":5,"reviews":9999},{"name":"Red Rock Plumbing","rating":4.5,"reviews":87}]\n```';

    // 1. our business is found, matched by whole name; competitors drop the invented name and the business itself
    let out = await (await run('Red Rock Plumbing', mapsFetch({
      profileReply: '{"found":true,"name":"Red Rock Plumbing","rating":4.5,"reviews":87,"address":"1 Main St","phone":"+1 435","website":"https://rr.example","hoursShown":true}',
      competitorReply: competitors, profilePlaces: ['Red Rock Plumbing'], competitorPlaces: ['Walker Plumbing, Heating & Air', 'Crystal Clear Plumbing', 'Red Rock Plumbing'],
    }))).json();
    assert.equal(out.profile.state, 'found');
    assert.equal(out.profile.reviews, 87);
    assert.equal(out.profile.hoursShown, true);
    assert.deepEqual(out.competitors.list.map((c) => [c.name, c.reviews]), [['Walker Plumbing, Heating & Air', 2209], ['Crystal Clear Plumbing', 507]]);
    assert.equal(out.osmId, 198783);

    // 2. Maps shows a similar but different business: not "found"
    out = await (await run('St George Plumbing', mapsFetch({
      profileReply: '{"found":true,"name":"St George Plumbing Pros","rating":4.9,"reviews":300}', competitorReply: '[]',
      profilePlaces: ['St George Plumbing Pros'], competitorPlaces: [],
    }))).json();
    assert.equal(out.profile.state, 'other');
    assert.equal(out.profile.closest.name, 'St George Plumbing Pros');
    assert.equal(out.competitors.state, 'none');

    // 3. the model names a listing Maps never returned: not found
    out = await (await run('Ghost Plumbing', mapsFetch({
      profileReply: '{"found":true,"name":"Ghost Plumbing","rating":5,"reviews":10}', competitorReply: 'not json', profilePlaces: ['Someone Else'], competitorPlaces: [],
    }))).json();
    assert.equal(out.profile.state, 'notfound');
    assert.equal(out.competitors.state, 'unreadable');

    // 4. bad input is refused; no key is a plain 502
    assert.equal((await run('<script>', mapsFetch({}))).status, 400);
    const nokey = await run('Red Rock Plumbing', mapsFetch({ profileReply: '', competitorReply: '', profilePlaces: [], competitorPlaces: [] }), {});
    assert.equal(nokey.status, 502);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('local-seo-audit pages: matches neighborhoods to sitemap addresses, reports a missing sitemap, rejects bad lists', async () => {
  const realFetch = globalThis.fetch;
  let hasSitemap = true;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith('https://cloudflare-dns.com/')) return Response.json({ Answer: /type=A$/.test(url) ? [{ type: 1, data: '93.184.216.34' }] : [] });
    if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
    if (url.endsWith('/sitemap.xml') && hasSitemap) return new Response('<urlset><url><loc>https://a.com/</loc></url><url><loc>https://a.com/plumber-coral-canyon-utah/</loc></url><url><loc>https://a.com/areas/green-spring</loc></url><url><loc>https://a.com/canyon-cove-guide</loc></url><url><loc>https://evil.example/millcreek</loc></url></urlset>', { headers: { 'Content-Type': 'application/xml' } });
    return new Response('', { status: 404 });
  };
  try {
    const { onRequestPost } = await import('../workers/tools/functions/local-seo-audit.js');
    const call = (neighborhoods, website = 'a.com') => onRequestPost({ env: {}, data: { body: { step: 'pages', website, neighborhoods } } });
    const hoods = ['Coral Canyon', 'Green Spring', 'Millcreek', 'Canyon Cove', 'Canyon', 'Coral'].map((name) => ({ name, lat: 37, lon: -113 }));
    const out = await (await call(hoods)).json();
    assert.equal(out.state, 'checked');
    assert.deepEqual(out.have.map((h) => h.name), ['Coral Canyon', 'Green Spring', 'Canyon Cove'], 'Canyon and Coral are not credited with the pages of Canyon Cove and Coral Canyon');
    assert.deepEqual(out.missing, ['Millcreek', 'Canyon', 'Coral']);
    assert.equal(out.sitemapPages, 4, 'only addresses on the checked site count');
    assert.equal((await call([])).status, 400);
    assert.equal((await call('x')).status, 400);
    assert.equal((await call(hoods, '127.0.0.1')).status, 400);
    hasSitemap = false;
    assert.equal((await (await call(hoods)).json()).state, 'nositemap');
  } finally {
    globalThis.fetch = realFetch;
  }
});
