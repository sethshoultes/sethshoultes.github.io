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
//             linked_from (another page links to it), feed (an <entry> in the feed file at `value` links it:
//             href="<site><url>", exactly, so /blog/a/ is not satisfied by /blog/a/b/ or by the feed's own links; site-kit#153),
//             post_image (the BlogPosting's `image`, the page's og:image and an <img> on the page are one picture; site-kit#214).
// A part with "feature": "<name>" is checked unless the site's .sitekit/features.json sets that name to false
// (post_images: a site that turned featured images off).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const typeOf = (html) => (html.match(/<body[^>]*\sdata-page-type="([^"]+)"/) || [])[1];

function jsonldNodes(html) {
  const out = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const d = JSON.parse(m[1]);
      out.push(...(d['@graph'] || [d]));
    } catch { /* kit-check reports unparsable JSON-LD */ }
  }
  return out;
}

const imageUrl = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? imageUrl(v[0]) : v && typeof v === 'object' ? v.url || v.contentUrl : undefined);
const pathOf = (u, site) => (u || '').replace(site, '').replace(/^https?:\/\/[^/]+/, '');

// The featured image: the BlogPosting names it, og:image is the same picture, and the page shows it.
function postImage(html, site) {
  const post = jsonldNodes(html).find((n) => [].concat(n['@type'] || []).includes('BlogPosting'));
  const image = imageUrl(post && post.image);
  if (!image) return false;
  const og = (html.match(/<meta(?=[^>]*\sproperty="og:image")[^>]*\scontent="([^"]+)"/) || [])[1];
  if (!og || pathOf(og, site) !== pathOf(image, site)) return false;
  return [...html.matchAll(/<img\b[^>]*\ssrc="([^"]+)"/g)].some(([, src]) => pathOf(src, site) === pathOf(image, site));
}

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

// Whether sitemap.xml lists the page: as built (/a.html) or as Pages serves it (/a), the form sitemap-check wants
// (site-kit#262). A whole <loc>, so /a is not found inside /ab.
const inSitemap = (sitemap, site, url) =>
  [url, url.replace(/\.html$/, '')].some((u) => new RegExp(`<loc>\\s*${(site + u).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*</loc>`).test(sitemap));

export function checkParts(part, ctx) {
  const { html, url, root, pages, llms, sitemap, site, read } = ctx;
  switch (part.need) {
    case 'contains': return html.includes(part.value);
    case 'regex': return new RegExp(part.value).test(html);
    case 'min_count': return (html.match(new RegExp(part.value, 'g')) || []).length >= (part.min || 1);
    case 'jsonld': return jsonldTypes(html).includes(part.value);
    case 'twin': return existsSync(join(root, url.replace(/\/$/, '') + '.md'));
    case 'llms': return llms.includes(`${site}${url}`);
    case 'sitemap': return inSitemap(sitemap, site, url);
    case 'linked_from': return pages.some(([u, h]) => u === part.value && h.includes(`href="${url}"`));
    case 'feed': return [...read(part.value).matchAll(/<entry\b[\s\S]*?<\/entry>/g)].some(([e]) => e.includes(`href="${site}${url}"`));
    case 'post_image': return postImage(html, site);
    default: throw new Error(`unknown part kind: ${part.need}`);
  }
}

export function checkPageTypes(root, spec, pages, features = {}) {
  const read = (f) => (existsSync(join(root, f)) ? readFileSync(join(root, f), 'utf8') : '');
  const site = spec.site || 'https://sethshoultes.com';
  const base = { root, pages, llms: read('llms.txt'), sitemap: read('sitemap.xml'), site, read };
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
      if (part.feature && features[part.feature] === false) continue;
      if (!checkParts(part, { ...base, html, url })) problems.push(`${url}: [page-type ${declared}] missing "${part.id}"${part.why ? ` (${part.why})` : ''}; reference page: ${def.reference}`);
    }
    for (const ban of [...(spec.banned || []), ...(def.banned || [])]) {
      if (new RegExp(ban.regex, 'i').test(html)) problems.push(`${url}: [banned] ${ban.id}`);
    }
  }
  return problems;
}
