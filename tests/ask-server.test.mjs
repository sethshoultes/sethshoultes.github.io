import assert from 'node:assert/strict';
import test from 'node:test';
import { onRequest as chat } from '../workers/ask/functions/chat.js';
import { onRequest as readiness } from '../workers/ask/functions/readiness.js';
import { safely } from '../workers/ask/functions/_shared.js';

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
