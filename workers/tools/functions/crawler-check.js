// AI crawler access check: reads a site's robots.txt for the four crawlers that
// feed AI answers, then looks for llms.txt, a markdown version and JSON-LD.
// Every result is something read from the site; a fetch that fails says so.

import { reply } from './_lib/guard.js';
import { makeSafeFetch, FetchError, parseTarget } from './_lib/safe-fetch.js';
import { parseRobots, evaluate } from './_lib/robots.js';
import { jsonLdTypes, markdownAlternate } from './_lib/html.js';

const BOTS = [
  { name: 'GPTBot', owner: 'OpenAI (ChatGPT)' },
  { name: 'ClaudeBot', owner: 'Anthropic (Claude)' },
  { name: 'PerplexityBot', owner: 'Perplexity' },
  { name: 'Google-Extended', owner: 'Google (Gemini and AI Overviews training)' },
];

async function attempt(work) {
  try {
    return await work();
  } catch (err) {
    if (err instanceof FetchError) return { error: err.message };
    throw err;
  }
}

function robotsResult(res) {
  if (res.error) return { state: 'unreadable', error: res.error };
  if (res.status === 404 || res.status === 410) return { state: 'missing' };
  if (res.status >= 400) return { state: 'unreadable', error: `The site answered ${res.status} for robots.txt.` };
  const groups = parseRobots(res.text);
  return { state: 'found', bots: BOTS.map((b) => ({ ...b, ...evaluate(groups, b.name) })) };
}

function llmsResult(res) {
  if (res.error) return { state: 'unreadable', error: res.error };
  const isText = !/html/i.test(res.contentType);
  if (res.status === 200 && isText && res.text.trim()) {
    return { state: 'found', bytes: res.text.length, firstLine: res.text.trim().split('\n')[0].slice(0, 120) };
  }
  return { state: 'missing' };
}

function markdownResult(home, probe, negotiated) {
  if (home.error) return { state: 'unreadable', error: home.error };
  const link = markdownAlternate(home.text);
  if (link) return { state: 'found', how: 'The home page links to a markdown version.', href: link };
  if (negotiated && /markdown/i.test(negotiated.contentType) && negotiated.status === 200) {
    return { state: 'found', how: 'The home page answers with markdown when a crawler asks for it.' };
  }
  if (probe && !probe.error && probe.status === 200 && /markdown|text\/plain/i.test(probe.contentType) && probe.text.trim()) {
    return { state: 'found', how: 'There is a markdown file at /index.md.' };
  }
  return { state: 'missing' };
}

function jsonLdResult(home) {
  if (home.error) return { state: 'unreadable', error: home.error };
  const found = jsonLdTypes(home.text);
  if (!found.blocks) return { state: home.truncated ? 'unreadable' : 'missing', error: home.truncated ? 'The home page was too large to read all of it.' : undefined };
  return { state: 'found', types: found.types, invalid: found.invalid };
}

export async function onRequestPost({ data }) {
  let target;
  try {
    target = parseTarget(data.body.url);
  } catch (err) {
    return reply(400, { error: err.message });
  }
  const safeFetch = makeSafeFetch();
  const origin = target.origin;

  const [robots, llms, home, probe, negotiated] = await Promise.all([
    attempt(() => safeFetch(`${origin}/robots.txt`, { accept: 'text/plain', maxBytes: 500_000 })),
    attempt(() => safeFetch(`${origin}/llms.txt`, { accept: 'text/plain', maxBytes: 500_000 })),
    attempt(() => safeFetch(target.href, { accept: 'text/html' })),
    attempt(() => safeFetch(`${origin}/index.md`, { accept: 'text/markdown', maxBytes: 100_000 })),
    attempt(() => safeFetch(target.href, { accept: 'text/markdown', maxBytes: 50_000 })),
  ]);

  if (home.error && robots.error && llms.error) return reply(502, { error: `We could not reach ${target.hostname}. ${home.error}` });

  return reply(200, {
    site: origin,
    robots: robotsResult(robots),
    llms: llmsResult(llms),
    markdown: markdownResult(home, probe, negotiated),
    jsonld: jsonLdResult(home),
  });
}
