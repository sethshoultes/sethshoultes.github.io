// The checks every tool request passes before any work happens: origin, JSON
// body, honeypot, a per-IP hourly limit and a per-tool daily cap. The limits
// live in Workers KV (binding TOOLS_KV). Counters are read-then-write, so a
// burst can overshoot a little; the daily cap is a bill guard, not a ledger.

export const ALLOWED_ORIGIN = 'https://sethshoultes.com';
export const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// perIpPerHour: one visitor. perDay: every visitor together, per UTC day.
export const LIMITS = {
  'crawler-check': { perIpPerHour: 10, perDay: 500 },
  'llms-txt': { perIpPerHour: 5, perDay: 200 },
};

export function reply(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

async function count(kv, key, limit, ttl) {
  const used = Number(await kv.get(key)) || 0;
  if (used >= limit) return false;
  await kv.put(key, String(used + 1), { expirationTtl: ttl });
  return true;
}

export async function guard(request, env, now = new Date()) {
  if (request.method === 'OPTIONS') return { response: new Response(null, { headers: CORS }) };
  if (request.method !== 'POST') return { response: reply(405, { error: 'POST only' }) };
  if (request.headers.get('Origin') !== ALLOWED_ORIGIN) return { response: reply(403, { error: 'Wrong origin' }) };

  const tool = new URL(request.url).pathname.split('/').filter(Boolean).pop();
  const limits = LIMITS[tool];
  if (!limits) return { response: reply(404, { error: 'No such tool' }) };

  let body;
  try {
    body = await request.json();
  } catch {
    return { response: reply(400, { error: 'Send JSON' }) };
  }
  if (!body || typeof body !== 'object') return { response: reply(400, { error: 'Send JSON' }) };

  // Honeypot: people never see this field, bots fill it. Pretend success.
  if (typeof body.website === 'string' && body.website.trim()) return { response: reply(200, { ok: true }) };

  if (!env.TOOLS_KV) return { response: reply(503, { error: 'This tool is not available right now.' }) };
  const ip = request.headers.get('CF-Connecting-IP');
  if (!ip) return { response: reply(400, { error: 'Could not tell who is asking.' }) };

  const day = now.toISOString().slice(0, 10);
  const hour = now.toISOString().slice(0, 13);
  if (!(await count(env.TOOLS_KV, `ip:${tool}:${ip}:${hour}`, limits.perIpPerHour, 3600))) {
    return { response: reply(429, { error: 'That is a lot of checks. Please try again in an hour.' }) };
  }
  if (!(await count(env.TOOLS_KV, `day:${tool}:${day}`, limits.perDay, 90000))) {
    return { response: reply(429, { error: "Today's free checks are used up. Please try again tomorrow, or book a call and I will run it for you." }) };
  }
  return { body, tool };
}
