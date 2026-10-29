// GET /count with `Authorization: Bearer <ADMIN_TOKEN>`: how many subscribers, by status. Counts only.
import { json } from './_lib/http.js';

export async function handle({ request, env }) {
  const auth = request.headers.get('Authorization') || '';
  if (!env.ADMIN_TOKEN || auth !== `Bearer ${env.ADMIN_TOKEN}`) return json(401, { error: 'No' });
  const rows = (await env.DB.prepare('SELECT status, COUNT(*) AS n FROM subscribers GROUP BY status').all()).results || [];
  const out = { pending: 0, confirmed: 0, unsubscribed: 0 };
  for (const r of rows) out[r.status] = r.n;
  return json(200, { ...out, total: out.pending + out.confirmed + out.unsubscribed });
}

export const onRequest = (ctx) => handle(ctx);
