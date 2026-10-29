import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { handle as subscribe } from '../workers/news/functions/subscribe.js';
import { handle as confirm } from '../workers/news/functions/confirm.js';
import { handle as unsubscribe } from '../workers/news/functions/unsubscribe.js';
import { handle as download } from '../workers/news/functions/download.js';
import { handle as count } from '../workers/news/functions/count.js';
import { downloadUrl, sign, verify, verifyDownload } from '../workers/news/functions/_lib/sign.js';
import { FILES, DEFAULT_FILE } from '../workers/news/functions/_lib/files.js';
import { MAILING_ADDRESS, FROM, REPLY_TO } from '../workers/news/functions/_lib/mail.js';

const sqlite = await import('node:sqlite').catch(() => null);

class FakeKV {
  constructor() { this.data = new Map(); }
  async get(k, type) { const v = this.data.get(k) ?? null; return v !== null && type === 'arrayBuffer' && typeof v === 'string' ? new TextEncoder().encode(v).buffer : v; }
  async put(k, v) { this.data.set(k, v); }
}

// A D1-shaped wrapper over node:sqlite, loaded with the real schema.
function makeDb() {
  const db = new sqlite.DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../workers/news/schema.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => { db.prepare(sql).run(...args); return {}; },
    all: async () => ({ results: db.prepare(sql).all(...args) }),
  });
  return { prepare: (sql) => stmt(sql), raw: db };
}

const SECRET = 'test-secret';
const NOW = new Date('2026-10-29T12:00:00Z');
const env = () => ({ DB: makeDb(), NEWS_KV: new FakeKV(), NEWS_SECRET: SECRET, RESEND_API_KEY: 'k', ADMIN_TOKEN: 'admin' });
const post = (body, { origin = 'https://sethshoultes.com', ip = '203.0.113.7' } = {}) => new Request('https://news.sethshoultes.com/subscribe', { method: 'POST', headers: { Origin: origin, 'CF-Connecting-IP': ip }, body: JSON.stringify(body) });
const mailbox = () => { const sent = []; return { sent, fetchImpl: async (url, init) => { sent.push(JSON.parse(init.body)); return new Response('{}', { status: 200 }); } }; };
const GOOD = { email: 'Reader@Example.com', source: '/library/', consent: true };

test('signing: a token verifies only for its own purpose and subject', async () => {
  const t = await sign(SECRET, 'confirm', 'abc');
  assert.equal(await verify(SECRET, 'confirm', 'abc', t), true);
  assert.equal(await verify(SECRET, 'unsubscribe', 'abc', t), false);
  assert.equal(await verify(SECRET, 'confirm', 'abd', t), false);
  assert.equal(await verify('other', 'confirm', 'abc', t), false);
  assert.equal(await verify(SECRET, 'confirm', 'abc', 'zz'), false);
});

test('download links expire and cannot be edited', async () => {
  const url = new URL(await downloadUrl('https://news.sethshoultes.com', SECRET, DEFAULT_FILE, NOW.getTime()));
  const [f, e, s] = ['f', 'e', 's'].map((k) => url.searchParams.get(k));
  assert.equal(await verifyDownload(SECRET, f, e, s, NOW.getTime()), true);
  assert.equal(await verifyDownload(SECRET, f, e, s, NOW.getTime() + 8 * 86400 * 1000), false, 'expired after 7 days');
  assert.equal(await verifyDownload(SECRET, f, Number(e) + 100, s, NOW.getTime()), false, 'longer expiry is not signed');
  assert.equal(await verifyDownload(SECRET, 'other-file', e, s, NOW.getTime()), false);
});

test('the footer carries Seth\'s postal address, the sender and the reply-to', () => {
  assert.equal(MAILING_ADDRESS, '1522 Heritage Fields Dr, Washington, Utah 84780');
  assert.match(FROM, /contact@sethshoultes\.com/);
  assert.equal(REPLY_TO, 'seth@smartwebutah.com');
});

test('library data and the worker agree on the files', () => {
  const lib = readFileSync(new URL('../_data/library.yml', import.meta.url), 'utf8');
  for (const slug of Object.keys(FILES)) assert.ok(lib.includes(`slug: ${slug}`), `${slug} is in _data/library.yml`);
});

test('subscribe: origin, honeypot, bad email and missing consent', { skip: !sqlite }, async () => {
  const e = env(), m = mailbox();
  assert.equal((await subscribe({ request: post(GOOD, { origin: 'https://evil.example' }), env: e }, NOW, m.fetchImpl)).status, 403);
  assert.equal((await subscribe({ request: post({ ...GOOD, email: 'nope' }), env: e }, NOW, m.fetchImpl)).status, 400);
  assert.equal((await subscribe({ request: post({ ...GOOD, consent: false }), env: e }, NOW, m.fetchImpl)).status, 400);
  const bot = await subscribe({ request: post({ ...GOOD, website: 'http://spam' }), env: e }, NOW, m.fetchImpl);
  assert.equal(bot.status, 200);
  assert.equal(m.sent.length, 0, 'the honeypot sends nothing and stores nothing');
  assert.equal(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM subscribers').get().n, 0);
});

test('subscribe, confirm, download, unsubscribe: the whole double opt-in', { skip: !sqlite }, async () => {
  const e = env(), m = mailbox();
  const res = await subscribe({ request: post(GOOD), env: e }, NOW, m.fetchImpl);
  assert.equal(res.status, 200);
  const row = e.DB.raw.prepare('SELECT * FROM subscribers').get();
  assert.equal(row.email, 'reader@example.com');
  assert.equal(row.status, 'pending');
  assert.equal(row.source, '/library/');
  assert.match(row.consent_text, /Unsubscribe any time/);
  assert.deepEqual(Object.keys(row).sort(), ['confirmed_at', 'consent_at', 'consent_text', 'email', 'id', 'source', 'status', 'unsubscribed_at'], 'nothing else is stored');

  assert.equal(m.sent.length, 1);
  const mail = m.sent[0];
  assert.equal(mail.to[0], 'reader@example.com');
  assert.equal(mail.reply_to, 'seth@smartwebutah.com');
  assert.match(mail.from, /contact@sethshoultes\.com/);
  assert.match(mail.headers['List-Unsubscribe'], /\/unsubscribe\?id=/);
  assert.equal(mail.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.ok(mail.html.includes('1522 Heritage Fields Dr, Washington, Utah 84780'));
  const confirmUrl = mail.text.match(/https:\/\/news\.sethshoultes\.com\/confirm\?[^\s]+/)[0];

  // A tampered confirm link does nothing.
  const bad = await confirm({ request: new Request(confirmUrl.replace(/t=[0-9a-f]/, 't=0')), env: e }, NOW);
  assert.equal(bad.status, 400);
  assert.equal(e.DB.raw.prepare('SELECT status FROM subscribers').get().status, 'pending');

  const ok = await confirm({ request: new Request(confirmUrl), env: e }, NOW);
  assert.equal(ok.status, 302);
  assert.equal(e.DB.raw.prepare('SELECT status FROM subscribers').get().status, 'confirmed');
  const loc = new URL(ok.headers.get('Location'));
  assert.equal(loc.origin + loc.pathname, 'https://sethshoultes.com/library/');
  assert.equal(loc.searchParams.get('confirmed'), '1');
  const dl = loc.searchParams.get('dl');

  // The signed link downloads the PDF, and a wrong or expired one does not.
  e.NEWS_KV.data.set(`pdf:${DEFAULT_FILE}`, '%PDF-1.4 test');
  const file = await download({ request: new Request(dl), env: e }, NOW);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('Content-Type'), 'application/pdf');
  assert.match(file.headers.get('Content-Disposition'), /attachment/);
  assert.equal((await download({ request: new Request(dl), env: e }, new Date(NOW.getTime() + 8 * 86400 * 1000))).status, 403);
  assert.equal((await download({ request: new Request(dl.replace(/s=[0-9a-f]/, 's=0')), env: e }, NOW)).status, 403);

  // Unsubscribe: a GET page and the one-click POST both work.
  const unsub = mail.headers['List-Unsubscribe'].slice(1, -1);
  const done = await unsubscribe({ request: new Request(unsub, { method: 'POST' }), env: e }, NOW);
  assert.equal(done.status, 200);
  assert.equal(e.DB.raw.prepare('SELECT status FROM subscribers').get().status, 'unsubscribed');
});

test('subscribe: the same address twice sends once, and a confirmed address gets a download link, not a confirm', { skip: !sqlite }, async () => {
  const e = env(), m = mailbox();
  await subscribe({ request: post(GOOD), env: e }, NOW, m.fetchImpl);
  await subscribe({ request: post(GOOD), env: e }, NOW, m.fetchImpl);
  assert.equal(m.sent.length, 1, 'a second sign-up inside 10 minutes sends nothing');
  assert.equal(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM subscribers').get().n, 1);
  e.DB.raw.prepare("UPDATE subscribers SET status = 'confirmed'").run();
  const later = new Date(NOW.getTime() + 20 * 60 * 1000);
  e.NEWS_KV.data.clear();
  await subscribe({ request: post(GOOD), env: e }, later, m.fetchImpl);
  assert.equal(m.sent.length, 2);
  assert.match(m.sent[1].subject, /^Your download/);
  assert.match(m.sent[1].text, /\/download\?f=/);
});

test('subscribe: after unsubscribing, signing up again records fresh consent', { skip: !sqlite }, async () => {
  const e = env(), m = mailbox();
  await subscribe({ request: post(GOOD), env: e }, NOW, m.fetchImpl);
  e.DB.raw.prepare("UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = 'x'").run();
  e.NEWS_KV.data.clear();
  const later = new Date(NOW.getTime() + 3600 * 1000);
  await subscribe({ request: post(GOOD), env: e }, later, m.fetchImpl);
  const row = e.DB.raw.prepare('SELECT * FROM subscribers').get();
  assert.equal(row.status, 'pending');
  assert.equal(row.unsubscribed_at, null);
  assert.equal(row.consent_at, later.toISOString());
});

test('subscribe: a failed send surfaces as an error, not a silent success', { skip: !sqlite }, async () => {
  const e = env();
  await assert.rejects(subscribe({ request: post(GOOD), env: e }, NOW, async () => new Response('no', { status: 500 })), /Resend 500/);
});

test('subscribe: the per-IP hourly limit stops a flood', { skip: !sqlite }, async () => {
  const e = env(), m = mailbox();
  const codes = [];
  for (let i = 0; i < 7; i++) codes.push((await subscribe({ request: post({ ...GOOD, email: `a${i}@example.com` }), env: e }, NOW, m.fetchImpl)).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429, 429]);
});

test('count: needs the admin token and returns counts only', { skip: !sqlite }, async () => {
  const e = env(), m = mailbox();
  await subscribe({ request: post(GOOD), env: e }, NOW, m.fetchImpl);
  const req = (auth) => new Request('https://news.sethshoultes.com/count', { headers: auth ? { Authorization: auth } : {} });
  assert.equal((await count({ request: req(null), env: e })).status, 401);
  assert.equal((await count({ request: req('Bearer nope'), env: e })).status, 401);
  const ok = await count({ request: req('Bearer admin'), env: e });
  assert.deepEqual(await ok.json(), { pending: 1, confirmed: 0, unsubscribed: 0, total: 1 });
});
