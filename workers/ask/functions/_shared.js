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

// What the assistant may say about Seth. Everything here is already public on
// sethshoultes.com; nothing else should be stated as fact.
export const FACTS = `
Seth Shoultes is a product leader and AI developer in Utah, USA. He has built websites and run businesses for over 25 years (since 2001). He now offers monthly AI consulting to small businesses.
Background: co-founded Event Espresso (2009 to 2021), a WordPress event plugin that won the $40,000 grand prize in the Utah Entrepreneur Challenge in 2011. Bought a garage door company, grew its search traffic and online presence, then sold it. Today a Senior Project Manager for several WordPress tools (AccessAlly, MemberMouse, Wishlist Member, PrettyLinks). Has organized WordPress meetups for over 15 years, has run AI meetups for over 2 years, and has taught and run workshops for over 20 years. Built a team of AI agents he uses to write, check and publish sites, content and apps.
Work: three years with A+ Garage Doors (research-backed neighborhood pages, a Google rank report for every neighborhood, staff apps for the warehouse and sales, and a company knowledge base the team asks questions of). MemberPress.ai (an AI assistant that runs a membership site, plus content, videos and launches). Garage Door Science (guides for homeowners and team apps for garage door companies).
Monthly plans (cancel any month): Advisor $1,500/month (a monthly strategy call, questions answered between calls, an AI roadmap kept up to date, the monthly meetup). Fractional AI Lead $4,000/month (everything in Advisor, a weekly call, Seth builds and runs your AI tools, agents and automations, your team is trained on what is built). Embedded AI Team $8,000/month (everything in Fractional AI Lead, plus Seth and his AI agent team working for you on sites, content pipelines and custom apps, with priority response).
One-time: AI Audit $2,500 (two weeks looking at how your business runs, then a written plan of where AI pays off first). Team Workshop $1,500 (a half-day, hands-on session where everyone leaves using AI on their real work).
To book a call: https://sethshoultes.com/consulting/#contact (Seth replies within two business days). Writing: https://sethshoultes.com/blog/. Case studies: https://sethshoultes.com/case-studies/. Meetup: https://sethshoultes.com/meetup/ (the Southern Utah WordPress Meetup group on Meetup.com currently has no upcoming event listed).
`.trim();
