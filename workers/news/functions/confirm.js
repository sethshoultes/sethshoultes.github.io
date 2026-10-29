// GET /confirm?id&t: the link in the confirm email. Marks the address confirmed and sends the
// reader on to /library/ with a fresh signed download link.
import { page } from './_lib/http.js';
import { DEFAULT_FILE } from './_lib/files.js';
import { ORIGIN, SITE } from './_lib/mail.js';
import { downloadUrl, verify } from './_lib/sign.js';

export async function handle({ request, env }, now = new Date()) {
  const u = new URL(request.url);
  const id = u.searchParams.get('id') || '';
  if (!(await verify(env.NEWS_SECRET, 'confirm', id, u.searchParams.get('t')))) {
    return page(400, 'That link did not work', 'It may be incomplete. Sign up again on sethshoultes.com/library/ and we will send a new one.');
  }
  const row = await env.DB.prepare('SELECT status FROM subscribers WHERE id = ?').bind(id).first();
  if (!row) return page(404, 'That link did not work', 'We could not find this sign-up. Sign up again on sethshoultes.com/library/.');
  if (row.status !== 'confirmed') {
    await env.DB.prepare('UPDATE subscribers SET status = ?, confirmed_at = ?, unsubscribed_at = NULL WHERE id = ?').bind('confirmed', now.toISOString(), id).run();
  }
  const dl = await downloadUrl(ORIGIN, env.NEWS_SECRET, DEFAULT_FILE, now.getTime());
  return new Response(null, { status: 302, headers: { Location: `${SITE}/library/?confirmed=1&dl=${encodeURIComponent(dl)}`, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

export const onRequest = (ctx) => handle(ctx);
