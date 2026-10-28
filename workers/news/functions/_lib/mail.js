// Emails through Resend. The newsletter's address is its own sender so replies and
// bounces stay out of the contact form's inbox.

export const FROM = 'Seth Shoultes <newsletter@sethshoultes.com>';
export const ORIGIN = 'https://news.sethshoultes.com';
export const SITE = 'https://sethshoultes.com';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function footer(env, unsubscribeUrl) {
  const addr = env.MAILING_ADDRESS ? `<br>${esc(env.MAILING_ADDRESS)}` : '';
  return `<p style="color:#6b7280;font-size:13px;margin-top:32px">You are getting this because you asked for it at sethshoultes.com. <a href="${esc(unsubscribeUrl)}">Unsubscribe</a> any time, in one click.${addr}</p>`;
}

function shell(body, env, unsubscribeUrl) {
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111827;line-height:1.6">${body}${footer(env, unsubscribeUrl)}</div>`;
}

const button = (href, label) => `<p><a href="${esc(href)}" style="background:#ff6b2c;color:#0b0d10;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block">${esc(label)}</a></p>`;

export function confirmEmail({ confirmUrl, unsubscribeUrl, env }) {
  const html = shell(`<p>Hi, it's Seth.</p><p>Confirm your email and your free PDF is one click away.</p>${button(confirmUrl, 'Confirm and download')}<p>If you did not ask for this, ignore this email and nothing will happen.</p>`, env, unsubscribeUrl);
  return { subject: 'Confirm your email to get the PDF', html, text: `Confirm your email and get your free PDF: ${confirmUrl}\n\nIf you did not ask for this, ignore this email.\nUnsubscribe: ${unsubscribeUrl}` };
}

export function downloadEmail({ downloadUrl, title, unsubscribeUrl, env }) {
  const html = shell(`<p>Hi, it's Seth.</p><p>Here is your link to <strong>${esc(title)}</strong>. It works for 7 days.</p>${button(downloadUrl, 'Download the PDF')}`, env, unsubscribeUrl);
  return { subject: `Your download: ${title}`, html, text: `Your link to ${title} (works for 7 days): ${downloadUrl}\n\nUnsubscribe: ${unsubscribeUrl}` };
}

export async function send(env, to, mail, unsubscribeUrl, fetchImpl = fetch) {
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
}
