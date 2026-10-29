import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequest as chat } from '../workers/ask/functions/chat.js';
import { onRequest as readiness } from '../workers/ask/functions/readiness.js';
import { safely } from '../workers/ask/functions/_shared.js';
import { handle as talk, resetIndexCache, NO_ANSWER, citedSources } from '../workers/ask/functions/talk.js';
import { loadBrain, loadPosts, chunk, htmlToText } from '../workers/ask/knowledge/sources.mjs';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const rate = () => {
  const store = new Map();
  return { get: async (k) => store.get(k) ?? null, put: async (k, v) => void store.set(k, v) };
};
const post = (path, body) =>
  new Request(`https://ask.sethshoultes.com/${path}`, {
    method: 'POST',
    headers: { Origin: 'https://sethshoultes.com', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const question = { messages: [{ role: 'user', content: 'What services does Seth offer?' }] };

async function withFetch(stub, run) {
  const real = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await run();
  } finally {
    globalThis.fetch = real;
  }
}

test('a thrown error becomes a JSON 502, not a bare Cloudflare error', async () => {
  const res = await safely(async () => { throw new Error('boom'); })({});
  assert.equal(res.status, 502);
  assert.match(res.headers.get('content-type'), /application\/json/);
  assert.match((await res.json()).error, /unavailable/);
});

test('chat without GEMINI_API_KEY answers a JSON "unavailable", never a fake answer', async () => {
  const res = await withFetch(async () => new Response('Seth offers AI consulting.'), () =>
    chat({ request: post('chat', question), env: { RATE: rate() } }));
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /unavailable/);
});

test('chat answers JSON when the site text cannot be fetched', async () => {
  const res = await withFetch(async () => { throw new Error('network'); }, () =>
    chat({ request: post('chat', question), env: { RATE: rate(), GEMINI_API_KEY: 'k' } }));
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /unavailable/);
});

test('chat returns the model answer when everything works', async () => {
  const stub = async (url) => (String(url).includes('generativelanguage')
    ? new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Advisor is $1,500 a month.' }] } }] }))
    : new Response('Advisor $1,500/month'));
  const res = await withFetch(stub, () => chat({ request: post('chat', question), env: { RATE: rate(), GEMINI_API_KEY: 'k' } }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { answer: 'Advisor is $1,500 a month.' });
});

test('readiness without GEMINI_API_KEY answers a JSON error', async () => {
  const body = { business: 'Plumber', size: 'Just me', aiUse: 'Not at all yet', timeSinks: 'Quotes and scheduling' };
  const res = await readiness({ request: post('readiness', body), env: { RATE: rate() } });
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /could not/);
});

// ---- /talk: Seth's AI, grounded in his writing (#172) ----

const b64 = (arr) => Buffer.from(Float32Array.from(arr).buffer).toString('base64');
// A tiny 3-dimension "embedding space": the question about EOS points at the EOS passage.
const eosPassage = { id: 'post:eos#0', title: 'Running a team on EOS', url: 'https://sethshoultes.com/blog/eos.html', text: 'I run weekly L10 meetings and keep a scorecard so the team always knows the numbers.', v: b64([1, 0, 0]) };
const videoPassage = { id: 'post:video#0', title: 'Video production notes', url: 'https://sethshoultes.com/blog/video.html', text: 'Plan the shots before the camera comes out.', v: b64([0, 1, 0]) };
const talkEnv = (vector, extra = {}) => {
  resetIndexCache();
  return {
    RATE: rate(),
    GEMINI_API_KEY: 'k',
    AI: { run: async () => ({ data: [vector] }) },
    TALK: { get: async () => ({ passages: [eosPassage, videoPassage] }) },
    ...extra,
  };
};
const gemini = (text, seen) => async (url, init) => {
  if (seen) seen.push(JSON.parse(init.body));
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
};

test('talk: a question the writing covers gets a cited answer, and only the cited page is returned as a source', async () => {
  const seen = [];
  const res = await withFetch(gemini('Seth runs weekly L10 meetings with a scorecard [1].', seen), () =>
    talk({ request: post('talk', { messages: [{ role: 'user', content: 'How do you approach team management with EOS?' }] }), env: talkEnv([1, 0.1, 0]) }));
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.answer, /L10/);
  assert.deepEqual(body.sources, [{ title: 'Running a team on EOS', url: 'https://sethshoultes.com/blog/eos.html' }]);
  const prompt = seen[0].systemInstruction.parts[0].text;
  assert.match(prompt, /\[1\] Running a team on EOS/);
  assert.doesNotMatch(prompt, /Video production notes/, 'a passage below the score threshold is not given to the model');
});

test('talk: when nothing in the writing matches, it says so and never calls the model', async () => {
  let called = false;
  const res = await withFetch(async () => { called = true; return new Response('{}'); }, () =>
    talk({ request: post('talk', { messages: [{ role: 'user', content: 'What is the capital of France?' }] }), env: talkEnv([0, 0, 1]) }));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { answer: NO_ANSWER, sources: [] });
  assert.equal(called, false);
});

test('talk: origin, JSON and an empty question are refused; a missing key is a JSON error', async () => {
  const env = talkEnv([1, 0, 0]);
  const wrong = new Request('https://ask.sethshoultes.com/talk', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: '{}' });
  assert.equal((await talk({ request: wrong, env })).status, 403);
  assert.equal((await talk({ request: post('talk', { messages: [] }), env })).status, 400);
  const noKey = await withFetch(gemini('x'), () => talk({ request: post('talk', { messages: [{ role: 'user', content: 'EOS?' }] }), env: talkEnv([1, 0, 0], { GEMINI_API_KEY: undefined }) }));
  assert.equal(noKey.status, 502);
  assert.match((await noKey.json()).error, /unavailable/);
});

test('talk: citations that point at no source are ignored', () => {
  assert.deepEqual(citedSources('See [1] and [9].', [{ title: 'A', url: 'u1', text: '' }]), [{ title: 'A', url: 'u1' }]);
});

test('knowledge: only notes marked public: true are ever read; a private note never reaches the index', () => {
  const dir = mkdtempSync(join(tmpdir(), 'brain-'));
  mkdirSync(join(dir, 'journal'));
  const body = 'Body text that is long enough to count as a real note. '.repeat(4);
  writeFileSync(join(dir, 'open.md'), `---\ntitle: Open note\npublic: true\n---\n${body}`);
  writeFileSync(join(dir, 'journal', 'private.md'), `---\ntitle: Private journal\npublic: false\n---\nSECRET-JOURNAL ${body}`);
  writeFileSync(join(dir, 'no-front-matter.md'), `SECRET-NO-FRONT-MATTER ${body}`);
  writeFileSync(join(dir, 'yes.md'), `---\npublic: yes\n---\nSECRET-YES ${body}`);
  writeFileSync(join(dir, 'client.md'), `---\ntitle: Client\nPublic: true\n---\nSECRET-CLIENT ${body}`);
  const notes = loadBrain(dir);
  assert.deepEqual(notes.map((n) => n.title), ['Open note']);
  assert.ok(!JSON.stringify(notes).includes('SECRET'), 'no private text anywhere in what would be indexed');
});

test('knowledge: posts load with their site URL, and passages stay a readable size', () => {
  const dir = mkdtempSync(join(tmpdir(), 'posts-'));
  writeFileSync(join(dir, '2026-04-20-twenty-five-years.html'), `---\ntitle: "Twenty-Five Years"\n---\n<p>${'A paragraph about building. '.repeat(20)}</p><p>${'Another one. '.repeat(60)}</p>`);
  const [post] = loadPosts(dir);
  assert.equal(post.url, 'https://sethshoultes.com/blog/twenty-five-years.html');
  assert.equal(post.title, 'Twenty-Five Years');
  for (const c of chunk(post.text)) assert.ok(c.length < 1500);
  assert.equal(htmlToText('<p>a &amp; b</p><script>x()</script>'), 'a & b');
});
