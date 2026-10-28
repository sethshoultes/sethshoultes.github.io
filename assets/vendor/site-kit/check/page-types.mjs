// Page-type check: every page of a type must have that type's required parts.
// Spec shape (site's _data/page-types.json):
//   { "types": { "city": { "reference": "/st-george-utah/", "pattern": "^/[a-z-]+-utah/$",
//       "parts": [ { "id": "flyover", "need": "contains", "value": "class=\"scrub\"" }, ... ] } },
//     "banned": [ { "id": "ai-disclaimer", "regex": "scenery above is generated" } ] }
// `banned` (top level for every typed page, or inside a type) lists text that must not appear.
// A page declares its type with <body data-page-type="city">. A page whose URL matches a type's
// `pattern` but does not declare the type fails: that is how a hand-made page is caught.
// Part kinds: contains (string), regex (pattern), min_count (regex + min), jsonld (@type),
//             twin (the .md twin exists), llms (llms.txt lists the page), sitemap (sitemap.xml lists it),
//             linked_from (another page links to it).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const typeOf = (html) => (html.match(/<body[^>]*\sdata-page-type="([^"]+)"/) || [])[1];

function jsonldTypes(html) {
  const out = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const d = JSON.parse(m[1]);
      for (const g of d['@graph'] || [d]) out.push(...[].concat(g['@type'] || []));
    } catch { /* kit-check reports unparsable JSON-LD */ }
  }
  return out;
}

export function checkParts(part, ctx) {
  const { html, url, root, pages, llms, sitemap, site } = ctx;
  switch (part.need) {
    case 'contains': return html.includes(part.value);
    case 'regex': return new RegExp(part.value).test(html);
    case 'min_count': return (html.match(new RegExp(part.value, 'g')) || []).length >= (part.min || 1);
    case 'jsonld': return jsonldTypes(html).includes(part.value);
    case 'twin': return existsSync(join(root, url.replace(/\/$/, '') + '.md'));
    case 'llms': return llms.includes(`${site}${url}`);
    case 'sitemap': return sitemap.includes(`${site}${url}`);
    case 'linked_from': return pages.some(([u, h]) => u === part.value && h.includes(`href="${url}"`));
    default: throw new Error(`unknown part kind: ${part.need}`);
  }
}

export function checkPageTypes(root, spec, pages) {
  const read = (f) => (existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : '');
  const site = spec.site || 'https://sethshoultes.com';
  const base = { root, pages, llms: read('llms.txt'), sitemap: read('sitemap.xml'), site };
  const problems = [];
  for (const [url, html] of pages) {
    const declared = typeOf(html);
    for (const [name, def] of Object.entries(spec.types)) {
      if (def.pattern && new RegExp(def.pattern).test(url) && declared !== name) {
        problems.push(`${url}: [page-type] URL looks like a ${name} page but does not declare data-page-type="${name}" (reference: ${def.reference})`);
      }
    }
    if (!declared) continue;
    const def = spec.types[declared];
    if (!def) { problems.push(`${url}: [page-type] unknown type "${declared}"`); continue; }
    for (const part of def.parts) {
      if (!checkParts(part, { ...base, html, url })) problems.push(`${url}: [page-type ${declared}] missing "${part.id}"${part.why ? ` (${part.why})` : ''}; reference page: ${def.reference}`);
    }
    for (const ban of [...(spec.banned || []), ...(def.banned || [])]) {
      if (new RegExp(ban.regex, 'i').test(html)) problems.push(`${url}: [banned] ${ban.id}`);
    }
  }
  return problems;
}
