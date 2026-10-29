// POST /subscribe {email, source, consent, website}: start the double opt-in.
// The reply is always the same {ok:true} so nobody can use this to learn who is on the list.
import { CORS, EMAIL_RE, allow, json } from './_lib/http.js';
import { ORIGIN, confirmEmail, downloadEmail, send } from './_lib/mail.js';
import { DEFAULT_FILE, FILES, pdfReady } from './_lib/files.js';
import { downloadUrl, sign } from './_lib/sign.js';

export const CONSENT_TEXT = 'Send me an email when something new ships. Unsubscribe any time.';
const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function handle({ request, env }, now = new Date(), fetchImpl = fetch) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'POST') return json(405, { error: 'POST only' });
  if (request.headers.get('Origin') !== 'https://sethshoultes.com') return json(403, { error: 'Wrong origin' });

  let data;
  try { data = await request.json(); } catch { return json(400, { error: 'Send JSON' }); }
  if (clean(data.website, 200)) return json(200, { ok: true }); // honeypot: pretend success

  const email = clean(data.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return json(400, { error: 'Please enter a valid email address.' });
  if (data.consent !== true) return json(400, { error: 'Please tick the box to say you want the emails.' });
  const source = clean(data.source, 120) || '/';

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const hour = now.toISOString().slice(0, 13), day = now.toISOString().slice(0, 10);
  if (!(await allow(env.NEWS_KV, `ip:${ip}:${hour}`, 5, 3700)) || !(await allow(env.NEWS_KV, `day:${day}`, 500, 90000))) {
    return json(429, { error: 'Too many requests. Try again later.' });
  }

  const stamp = now.toISOString();
  const row = await env.DB.prepare('SELECT id, status FROM subscribers WHERE email = ?').bind(email).first();
  let id = row?.id;
  if (!row) {
    id = crypto.randomUUID();
    await env.DB.prepare('INSERT INTO subscribers (id, email, status, source, consent_text, consent_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, email, 'pending', source, CONSENT_TEXT, stamp).run();
  } else if (row.status === 'unsubscribed') {
    // A fresh sign-up after unsubscribing is a fresh consent: record it again.
    await env.DB.prepare('UPDATE subscribers SET status = ?, source = ?, consent_text = ?, consent_at = ?, confirmed_at = NULL, unsubscribed_at = NULL WHERE id = ?')
      .bind('pending', source, CONSENT_TEXT, stamp, id).run();
  }

  // One email per address per 10 minutes, whatever they type into the form.
  if (!(await allow(env.NEWS_KV, `sent:${id}`, 1, 600))) return json(200, { ok: true });

  const unsubscribeUrl = `${ORIGIN}/unsubscribe?id=${id}&t=${await sign(env.NEWS_SECRET, 'unsubscribe', id)}`;
  const status = row?.status === 'unsubscribed' ? 'pending' : row?.status || 'pending';
  const ready = await pdfReady(env.NEWS_KV, DEFAULT_FILE);
  const confirmUrl = `${ORIGIN}/confirm?id=${id}&t=${await sign(env.NEWS_SECRET, 'confirm', id)}`;
  let mail;
  if (status !== 'confirmed') mail = confirmEmail({ confirmUrl, unsubscribeUrl, ready });
  else if (ready) mail = downloadEmail({ downloadUrl: await downloadUrl(ORIGIN, env.NEWS_SECRET, DEFAULT_FILE, now.getTime()), title: FILES[DEFAULT_FILE].title, unsubscribeUrl });
  else return json(200, { ok: true }); // already confirmed and nothing to send yet
  await send(env, email, mail, unsubscribeUrl, fetchImpl);
  return json(200, { ok: true });
}

export async function onRequest(ctx) {
  try {
    return await handle(ctx);
  } catch {
    return json(502, { error: 'We could not send the email just now. Please try again in a few minutes.' });
  }
}
