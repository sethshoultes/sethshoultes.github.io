// Pulls two facts out of a page's HTML: its JSON-LD types and whether it points
// to a markdown version.

// Pages are attacker-controlled, so nothing here uses a regex that can
// backtrack over the whole page. Tags are found with indexOf, in one pass.
const MAX_TAGS = 500;

function openTags(html, name) {
  const lower = html.toLowerCase();
  const tags = [];
  let at = lower.indexOf(`<${name}`);
  while (at >= 0 && tags.length < MAX_TAGS) {
    const next = lower[at + name.length + 1];
    const end = lower.indexOf('>', at);
    if (end < 0) break;
    if (next === undefined || /[\s/>]/.test(next)) tags.push({ text: html.slice(at, end + 1), end });
    at = lower.indexOf(`<${name}`, end);
  }
  return { tags, lower };
}

function attrs(tag) {
  const found = {};
  for (const m of tag.matchAll(/([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) found[m[1].toLowerCase()] = m[2] ?? m[3];
  return found;
}

function collectTypes(node, out) {
  if (Array.isArray(node)) { node.forEach((n) => collectTypes(n, out)); return; }
  if (!node || typeof node !== 'object') return;
  if (node['@type']) [].concat(node['@type']).forEach((t) => typeof t === 'string' && out.add(t));
  if (node['@graph']) collectTypes(node['@graph'], out);
}

export function jsonLdTypes(html) {
  const types = new Set();
  let blocks = 0;
  let invalid = 0;
  const { tags, lower } = openTags(html, 'script');
  for (const tag of tags) {
    if ((attrs(tag.text).type || '').toLowerCase() !== 'application/ld+json') continue;
    const close = lower.indexOf('</script', tag.end);
    blocks += 1;
    try {
      collectTypes(JSON.parse(html.slice(tag.end + 1, close < 0 ? undefined : close)), types);
    } catch {
      invalid += 1;
    }
  }
  return { blocks, invalid, types: [...types] };
}

export function markdownAlternate(html) {
  for (const tag of openTags(html, 'link').tags) {
    const a = attrs(tag.text);
    if ((a.rel || '').toLowerCase().split(/\s+/).includes('alternate') && (a.type || '').toLowerCase() === 'text/markdown' && a.href) return a.href;
  }
  return null;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

const clean = (text) => decodeEntities(text).replace(/\s+/g, ' ').trim();

// A page's title, description and site name, as the page itself states them.
export function pageInfo(html) {
  const meta = {};
  for (const tag of openTags(html, 'meta').tags) {
    const a = attrs(tag.text);
    const key = (a.name || a.property || '').toLowerCase();
    if (key && a.content && !meta[key]) meta[key] = clean(a.content);
  }
  const { tags, lower } = openTags(html, 'title');
  let title = '';
  if (tags.length) {
    const close = lower.indexOf('</title', tags[0].end);
    if (close > 0) title = clean(html.slice(tags[0].end + 1, close));
  }
  return {
    title: meta['og:title'] || title,
    description: meta.description || meta['og:description'] || '',
    siteName: meta['og:site_name'] || '',
  };
}
