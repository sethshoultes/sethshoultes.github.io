import test from 'node:test';
import assert from 'node:assert/strict';

import { guard, ALLOWED_ORIGIN } from '../workers/tools/functions/_lib/guard.js';
import { parseTarget, isPrivateIp, makeSafeFetch, FetchError } from '../workers/tools/functions/_lib/safe-fetch.js';
import { parseRobots, evaluate } from '../workers/tools/functions/_lib/robots.js';
import { jsonLdTypes, markdownAlternate, pageInfo } from '../workers/tools/functions/_lib/html.js';

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
  assert.ok(Date.now() - started < 3000, `took ${Date.now() - started}ms`);
});
