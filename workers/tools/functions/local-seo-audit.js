// Local SEO quick audit. Two steps:
//   step "lookup": the business's Google Maps listing (rating, reviews, address,
//     phone, website, hours shown) and the review counts of nearby competitors,
//     from Google Maps through Gemini. Every listing must match a place Maps
//     returned, and the business itself must match by whole name (see names.js).
//   step "pages": which of the city's neighborhoods have a page on the site, by
//     the site's own sitemap. The browser reads the neighborhoods (see
//     neighborhood-planner.js) and sends them here.
// What cannot be found is said so; nothing is estimated.

import { reply } from './_lib/guard.js';
import { askMaps, readJson, num, str, MapsError } from './_lib/maps.js';
import { isSame } from './_lib/names.js';
import { findCity, GeoError } from './_lib/geo.js';
import { makeSafeFetch, parseTarget } from './_lib/safe-fetch.js';
import { findSitemaps, collectUrls } from './_lib/sitemap-fetch.js';
import { sameSite } from './_lib/sitemap.js';

const OK = /^[\p{L}\p{N} .,'&()\-/]+$/u;
const MAX_NEIGHBORHOODS = 40;

function field(value, label, max) {
  const v = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  if (v.length < 2 || v.length > max || !OK.test(v)) throw new Error(`Please enter ${label} using letters and numbers (up to ${max} characters).`);
  return v;
}

const profilePrompt = (business, city) =>
  `Find the Google Maps listing for the business "${business}" in ${city}. Reply with only JSON, no other text: ` +
  '{"found":true or false,"name":string,"rating":number or null,"reviews":number or null,"address":string or null,"phone":string or null,"website":string or null,"hoursShown":true or false}. ' +
  'Use only what Google Maps shows for that listing, and null where it shows no value. If you cannot find a listing with that name, answer {"found":false}.';

const competitorPrompt = (service, city) =>
  `List up to 8 ${service} businesses in ${city} on Google Maps. Reply with only a JSON array, no other text: ` +
  '[{"name":string,"rating":number or null,"reviews":number or null}]. Use only the star rating and review count Google Maps shows, and null where it shows none.';

const placeNamed = (places, name) => places.find((p) => isSame(p.name, name));

async function profile(env, business, city) {
  const { text, places } = await askMaps(env, profilePrompt(business, city));
  const j = readJson(text);
  if (!j || typeof j !== 'object' || Array.isArray(j)) return { state: 'unreadable' };
  if (j.found !== true || !str(j.name, 120)) return { state: 'notfound' };
  const place = placeNamed(places, j.name);
  if (!place) return { state: 'notfound' };
  const out = {
    name: place.name, mapsUrl: place.url,
    rating: num(j.rating, 1, 5), reviews: num(j.reviews, 0, 10_000_000),
    address: str(j.address, 200), phone: str(j.phone, 40), website: str(j.website, 200), hoursShown: j.hoursShown === true,
  };
  // The listing must be this business: whole-name equality, not a similar name.
  return isSame(business, place.name) ? { state: 'found', ...out } : { state: 'other', closest: out };
}

async function competitors(env, business, service, city) {
  const { text, places } = await askMaps(env, competitorPrompt(service, city));
  const j = readJson(text);
  if (!Array.isArray(j)) return { state: 'unreadable', list: [] };
  const seen = new Set();
  const list = [];
  for (const c of j.slice(0, 12)) {
    const name = str(c && c.name, 120);
    const place = name && placeNamed(places, name);
    if (!place || seen.has(place.placeId) || isSame(business, place.name)) continue;
    seen.add(place.placeId);
    list.push({ name: place.name, mapsUrl: place.url, rating: num(c.rating, 1, 5), reviews: num(c.reviews, 0, 10_000_000) });
  }
  list.sort((a, b) => (b.reviews ?? -1) - (a.reviews ?? -1));
  return { state: list.length ? 'found' : 'none', list: list.slice(0, 8) };
}

async function lookupStep(env, body) {
  const business = field(body.business, 'your business name', 80);
  const service = field(body.service, 'the service you offer', 60);
  const city = field(body.city, 'your city', 60);
  const settle = async (work) => {
    try { return await work(); } catch (err) { if (err instanceof MapsError) return { state: 'failed', error: err.message, list: [] }; throw err; }
  };
  const [me, others, cityInfo] = await Promise.all([
    settle(() => profile(env, business, city)),
    settle(() => competitors(env, business, service, city)),
    findCity(city).catch((err) => (err instanceof GeoError ? null : Promise.reject(err))),
  ]);
  if (me.state === 'failed' && others.state === 'failed') return reply(502, { error: 'Google Maps could not be reached right now. Please try again in a few minutes.' });
  return reply(200, { business, service, city, osmId: cityInfo ? cityInfo.osmId : null, profile: me, competitors: others, source: 'Google Maps, read through Gemini' });
}

const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function readNeighborhoods(list) {
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_NEIGHBORHOODS) return null;
  const out = [];
  for (const h of list) {
    const name = typeof (h && h.name) === 'string' ? h.name.replace(/\s+/g, ' ').trim() : '';
    if (!name || name.length > 80 || !slug(name)) return null;
    out.push(name);
  }
  return [...new Set(out)];
}

async function pagesStep(body) {
  let site;
  try { site = parseTarget(body.website); } catch (err) { return reply(400, { error: err.message }); }
  const names = readNeighborhoods(body.neighborhoods);
  if (!names) return reply(400, { error: 'That list of neighborhoods could not be read. Please try again.' });

  const safeFetch = makeSafeFetch();
  const startedAt = Date.now();
  const { urls, read } = await collectUrls(safeFetch, await findSitemaps(safeFetch, site.origin, site.hostname), site.hostname, startedAt);
  if (!read) return reply(200, { site: site.origin, state: 'nositemap' });

  const paths = urls.filter((u) => sameSite(u, site.hostname)).map((u) => {
    try { return { url: u, key: `-${slug(new URL(u).pathname)}-` }; } catch { return null; }
  }).filter(Boolean);
  // A page names a neighborhood when the neighborhood's words appear together in its address. When
  // a longer neighborhood name also fits the same address ("Coral Canyon" for "Coral"), the page
  // belongs to the longer one, so a short name is never credited with another neighborhood's page.
  const keys = names.map((name) => ({ name, key: `-${slug(name)}-` }));
  const claimed = (hit, other) => other.key !== hit.key && other.key.includes(hit.key);
  const have = [];
  const missing = [];
  for (const n of keys) {
    const page = paths.find((p) => p.key.includes(n.key) && !keys.some((o) => claimed(n, o) && p.key.includes(o.key)));
    if (page) have.push({ name: n.name, url: page.url }); else missing.push(n.name);
  }
  return reply(200, { site: site.origin, state: 'checked', sitemapPages: paths.length, have, missing });
}

export async function onRequestPost({ data, env }) {
  const body = data.body;
  try {
    return body.step === 'pages' ? await pagesStep(body) : await lookupStep(env, body);
  } catch (err) {
    if (err instanceof GeoError || err instanceof MapsError) return reply(502, { error: err.message });
    if (err instanceof Error && /^Please enter /.test(err.message)) return reply(400, { error: err.message });
    console.log('local-seo-audit failed', err && err.stack ? err.stack : String(err));
    return reply(500, { error: 'Something went wrong on our side. Please try again in a few minutes.' });
  }
}
