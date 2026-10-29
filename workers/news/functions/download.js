// GET /download?f&e&s: a signed, expiring link to one PDF held in KV.
import { page } from './_lib/http.js';
import { FILES } from './_lib/files.js';
import { verifyDownload } from './_lib/sign.js';

export async function handle({ request, env }, now = new Date()) {
  const u = new URL(request.url);
  const f = u.searchParams.get('f') || '';
  if (!Object.hasOwn(FILES, f) || !(await verifyDownload(env.NEWS_SECRET, f, u.searchParams.get('e'), u.searchParams.get('s'), now.getTime()))) {
    return page(403, 'That download link has expired', 'Links work for 7 days. Ask for a new one on sethshoultes.com/library/.');
  }
  const pdf = await env.NEWS_KV.get(`pdf:${f}`, 'arrayBuffer');
  if (!pdf) return page(404, 'That file is not available yet', 'Please try again later.');
  return new Response(pdf, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${FILES[f].filename}"`, 'Cache-Control': 'private, no-store' } });
}

export const onRequest = (ctx) => handle(ctx);
