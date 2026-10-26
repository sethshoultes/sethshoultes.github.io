// Shared by the chat and readiness endpoints for sethshoultes.com. The site is
// static GitHub Pages, so the pages post here (ask.sethshoultes.com). Secrets:
// ANTHROPIC_API_KEY (Pages secret). RATE is a KV namespace for the limits.

export const ALLOWED_ORIGIN = 'https://sethshoultes.com';
export const MODEL = 'claude-sonnet-5-5';
const PER_IP_PER_HOUR = 20;
const PER_DAY_TOTAL = 1500;

const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export function reply(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

export function preflight() {
  return new Response(null, { headers: CORS });
}

// Origin check, then a per-visitor hourly limit and a site-wide daily cap, so a
// public page cannot run up the model bill. Returns a Response to send, or null.
export async function guard(request, env) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return reply(405, { error: 'POST only' });
  if (request.headers.get('Origin') !== ALLOWED_ORIGIN) return reply(403, { error: 'Wrong origin' });

  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const hour = new Date().toISOString().slice(0, 13);
  const day = hour.slice(0, 10);
  const ipKey = `ip:${ip}:${hour}`;
  const dayKey = `day:${day}`;
  const [ipCount, dayCount] = await Promise.all([
    env.RATE.get(ipKey).then(Number),
    env.RATE.get(dayKey).then(Number),
  ]);
  if (dayCount >= PER_DAY_TOTAL) return reply(429, { error: 'Today\'s free questions are used up. Please come back tomorrow, or book a call.' });
  if (ipCount >= PER_IP_PER_HOUR) return reply(429, { error: 'That is a lot of questions in an hour. Please try again a little later.' });
  await Promise.all([
    env.RATE.put(ipKey, String(ipCount + 1), { expirationTtl: 7200 }),
    env.RATE.put(dayKey, String(dayCount + 1), { expirationTtl: 172800 }),
  ]);
  return null;
}

export function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function callModel(env, system, messages, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages }),
  });
  if (!res.ok) {
    console.log('anthropic failed', res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

// What the assistant may say about Seth: the plain-text version of his own pages,
// generated from the site (llms-full.txt). Nothing else may be stated as fact.
// Returns null if the file cannot be fetched, so callers fail visibly instead of guessing.
export async function siteText() {
  const res = await fetch(`${ALLOWED_ORIGIN}/llms-full.txt`, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!res.ok) {
    console.log('llms-full.txt failed', res.status);
    return null;
  }
  return (await res.text()).slice(0, 80000);
}
