export const ALLOWED_ORIGIN = 'https://sethshoultes.com';
export const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// A plain page for the links people click in an email (confirm problems, unsubscribe).
export const page = (status, heading, body) => new Response(
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(heading)}</title><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#0b0d10;color:#f4f4f5;display:grid;place-items:center;min-height:100vh;margin:0"><main style="max-width:30rem;padding:2rem"><h1 style="font-size:1.6rem">${esc(heading)}</h1><p style="color:#a1a7b0;line-height:1.6">${esc(body)}</p><p><a href="https://sethshoultes.com/" style="color:#ff6b2c">Back to sethshoultes.com</a></p></main></body></html>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } },
);

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

// Per-IP and per-day counters in KV (read, then write: a burst can overshoot a little).
export async function allow(kv, key, limit, ttl) {
  const used = Number(await kv.get(key)) || 0;
  if (used >= limit) return false;
  await kv.put(key, String(used + 1), { expirationTtl: ttl });
  return true;
}
