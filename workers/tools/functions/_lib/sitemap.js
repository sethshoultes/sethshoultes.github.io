import { decodeEntities } from './html.js';

export function isIndex(xml) {
  return /<sitemapindex\b/i.test(xml);
}

export function locs(xml) {
  const lower = xml.toLowerCase();
  const found = [];
  let at = lower.indexOf('<loc>');
  while (at >= 0 && found.length < 50000) {
    const close = lower.indexOf('</loc>', at);
    if (close < 0) break;
    const value = xml.slice(at + 5, close).trim().replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
    if (value) found.push(decodeEntities(value));
    at = lower.indexOf('<loc>', close);
  }
  return found;
}

// Addresses that are not worth listing for an AI assistant: feeds, archives,
// pagination, shopping and login pages, and files.
const NOISE = /(\/(tag|tags|category|categories|author|feed|wp-json|wp-admin|wp-content|cart|checkout|my-account|login|search|cdn-cgi)\/|\/page\/\d+|\/feed\/?$|[?#]|\.(xml|gz|pdf|jpe?g|png|gif|webp|svg|zip|mp4|mp3|css|js|json|txt)$)/i;

// Same-site pages, shallowest first (the pages a visitor would call "key"),
// without duplicates, the home page, or noise.
export function pickPages(urls, siteHost, limit) {
  const host = siteHost.replace(/^www\./, '');
  const seen = new Set();
  const pages = [];
  urls.forEach((raw, order) => {
    let u;
    try { u = new URL(raw); } catch { return; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
    if (u.hostname.toLowerCase().replace(/^www\./, '') !== host) return;
    if (NOISE.test(u.href)) return;
    const path = u.pathname.replace(/\/+$/, '') || '/';
    if (path === '/' || seen.has(path)) return;
    seen.add(path);
    pages.push({ url: u.href, depth: path.split('/').filter(Boolean).length, order });
  });
  pages.sort((a, b) => a.depth - b.depth || a.order - b.order);
  return pages.slice(0, limit);
}
