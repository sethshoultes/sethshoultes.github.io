// Contact form for sethshoultes.com/consulting/. The site is static GitHub
// Pages, so the form posts to this Cloudflare Pages Function at
// contact.sethshoultes.com; it emails Seth through Resend with the visitor as
// reply-to. RESEND_API_KEY is a Pages secret.

const TO_EMAIL = 'seth@smartwebutah.com';
const FROM_EMAIL = 'Seth Shoultes website <website@sethshoultes.com>';
const ALLOWED_ORIGIN = 'https://sethshoultes.com';
const LIMITS = { name: 120, email: 254, company: 160, interest: 80, message: 5000 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function reply(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (request.method !== 'POST') return reply(405, { error: 'POST only' });
  if (request.headers.get('Origin') !== ALLOWED_ORIGIN) return reply(403, { error: 'Wrong origin' });

  let data;
  try {
    data = await request.json();
  } catch {
    return reply(400, { error: 'Send JSON' });
  }

  // Honeypot: people never see this field, bots fill it. Pretend success.
  if (clean(data.website, 200)) return reply(200, { ok: true });

  const f = {};
  for (const [key, max] of Object.entries(LIMITS)) f[key] = clean(data[key], max);
  if (!f.name || !EMAIL_RE.test(f.email) || f.message.length < 10) {
    return reply(400, { error: 'Please give your name, a valid email and a short message.' });
  }

  const text = [
    `Name: ${f.name}`,
    `Email: ${f.email}`,
    `Company: ${f.company || '-'}`,
    `Interested in: ${f.interest || '-'}`,
    '',
    f.message,
  ].join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      reply_to: f.email,
      subject: `Consulting inquiry from ${f.name}${f.company ? ` (${f.company})` : ''}`,
      text,
    }),
  });
  if (!res.ok) {
    console.log('resend failed', res.status, await res.text());
    return reply(502, { error: 'Sending failed. Please email seth@smartwebutah.com directly.' });
  }
  return reply(200, { ok: true });
}
