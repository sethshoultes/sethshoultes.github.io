// Emails through Resend from contact@sethshoultes.com (a verified Resend domain); replies go to Seth.

export const FROM = 'Seth Shoultes <contact@sethshoultes.com>';
export const REPLY_TO = 'seth@smartwebutah.com';
// The postal address CAN-SPAM wants in every email footer (Seth, 2026-10-29).
export const MAILING_ADDRESS = '1522 Heritage Fields Dr, Washington, Utah 84780';
export const ORIGIN = 'https://news.sethshoultes.com';
export const SITE = 'https://sethshoultes.com';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function footer(unsubscribeUrl) {
  const addr = `<br>${esc(MAILING_ADDRESS)}`;
  return `<p style="color:#6b7280;font-size:13px;margin-top:32px">You are getting this because you asked for it at sethshoultes.com. <a href="${esc(unsubscribeUrl)}">Unsubscribe</a> any time, in one click.${addr}</p>`;
}

function shell(body, unsubscribeUrl) {
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111827;line-height:1.6">${body}${footer(unsubscribeUrl)}</div>`;
}

const button = (href, label) => `<p><a href="${esc(href)}" style="background:#ff6b2c;color:#0b0d10;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:700;display:inline-block">${esc(label)}</a></p>`;

// `ready` is whether the PDF is loaded yet. Until it is, the email says so instead of promising it.
export function confirmEmail({ confirmUrl, unsubscribeUrl, ready }) {
  const line = ready ? 'Confirm your email and your free PDF is one click away.' : 'Confirm your email and I will send you the PDF the day it publishes.';
  const html = shell(`<p>Hi, it's Seth.</p><p>${line}</p>${button(confirmUrl, ready ? 'Confirm and download' : 'Confirm my email')}<p>If you did not ask for this, ignore this email and nothing will happen.</p>`, unsubscribeUrl);
  return { subject: ready ? 'Confirm your email to get the PDF' : 'Confirm your email', html, text: `${line} ${confirmUrl}\n\nIf you did not ask for this, ignore this email.\n\nUnsubscribe: ${unsubscribeUrl}\n${MAILING_ADDRESS}` };
}

export function downloadEmail({ downloadUrl, title, unsubscribeUrl }) {
  const html = shell(`<p>Hi, it's Seth.</p><p>Here is your link to <strong>${esc(title)}</strong>. It works for 7 days.</p>${button(downloadUrl, 'Download the PDF')}`, unsubscribeUrl);
  return { subject: `Your download: ${title}`, html, text: `Your link to ${title} (works for 7 days): ${downloadUrl}\n\nUnsubscribe: ${unsubscribeUrl}\n${MAILING_ADDRESS}` };
}

export async function send(env, to, mail, unsubscribeUrl, fetchImpl = fetch) {
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      reply_to: REPLY_TO,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
}
