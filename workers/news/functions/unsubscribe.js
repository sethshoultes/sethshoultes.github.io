// GET /unsubscribe?id&t shows a confirmation and unsubscribes; POST does the same for the
// one-click List-Unsubscribe header that mail apps send (RFC 8058).
import { page } from './_lib/http.js';
import { verify } from './_lib/sign.js';

export async function handle({ request, env }, now = new Date()) {
  const u = new URL(request.url);
  const id = u.searchParams.get('id') || '';
  if (!(await verify(env.NEWS_SECRET, 'unsubscribe', id, u.searchParams.get('t')))) {
    return page(400, 'That link did not work', 'To unsubscribe, reply to any email from Seth and say so.');
  }
  await env.DB.prepare("UPDATE subscribers SET status = 'unsubscribed', unsubscribed_at = ? WHERE id = ? AND status != 'unsubscribed'").bind(now.toISOString(), id).run();
  if (request.method === 'POST') return new Response('ok', { status: 200 });
  return page(200, 'You are unsubscribed', 'You will not get any more emails from this list.');
}

export const onRequest = (ctx) => handle(ctx);
