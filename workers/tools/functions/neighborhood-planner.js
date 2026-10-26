// Neighborhood page planner. Two steps, so the slow map query can run in the
// visitor's browser instead of here:
//   step "city": find the city on OpenStreetMap (name and id).
//   step "join": for the neighborhoods the browser found, look up each one's
//                census tract, that tract's home age, home count and median home
//                value (American Community Survey), and rank them.
// The Census figures describe the tract, not the neighborhood, and the answer says so.

import { reply } from './_lib/guard.js';
import { findCity, tractFor, tractFacts, GeoError } from './_lib/geo.js';

const OK = /^[\p{L}\p{N} .,'\-]+$/u;
const MAX_NEIGHBORHOODS = 40;

async function pool(items, size, work) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await work(items[i]);
    }
  }));
  return out;
}

const cleanName = (n) => (typeof n === 'string' ? n.replace(/\s+/g, ' ').trim() : '');

// The browser's list is untrusted: names are text, places are US coordinates, and there are few of them.
function readNeighborhoods(list) {
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_NEIGHBORHOODS) return null;
  const seen = new Set();
  const out = [];
  for (const h of list) {
    const name = cleanName(h && h.name);
    const lat = Number(h && h.lat);
    const lon = Number(h && h.lon);
    if (!name || name.length > 80 || !(lat >= 17 && lat <= 72) || !(lon >= -180 && lon <= -60)) return null;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, lat, lon });
  }
  return out;
}

async function joinStep(body) {
  const city = cleanName(body.city);
  const hoods = readNeighborhoods(body.neighborhoods);
  if (!city || city.length > 120 || !hoods) return reply(400, { error: 'That list of neighborhoods could not be read. Please try again.' });

  const thisYear = new Date().getUTCFullYear();
  const tracts = await pool(hoods, 8, (h) => tractFor(h.lat, h.lon));
  const geoids = [...new Set(tracts.filter(Boolean).map((t) => t.geoid))];
  const { facts, release } = await tractFacts(geoids);

  const rows = hoods.map((h, i) => {
    const t = tracts[i];
    const f = t && facts[t.geoid];
    const complete = f && f.medianYearBuilt && f.housingUnits;
    return {
      name: h.name,
      tract: t ? t.name : null,
      medianYearBuilt: f ? f.medianYearBuilt : null,
      housingUnits: f ? f.housingUnits : null,
      medianValue: f ? f.medianValue : null,
      // Homes in the tract times the median age of those homes: more homes and
      // older homes both raise it. A ranking aid, not a measured quantity.
      priority: complete ? Math.round(f.housingUnits * (thisYear - f.medianYearBuilt)) : null,
    };
  });
  rows.sort((a, b) => (b.priority ?? -1) - (a.priority ?? -1) || a.name.localeCompare(b.name));
  return reply(200, {
    city,
    neighborhoods: rows,
    sources: { map: 'OpenStreetMap contributors', census: release || null },
    unmatched: rows.filter((r) => r.priority === null).length,
  });
}

export async function onRequestPost({ data }) {
  const body = data.body;
  try {
    if (body.step === 'join') return await joinStep(body);
    const raw = typeof body.city === 'string' ? body.city.replace(/\s+/g, ' ').trim() : '';
    if (raw.length < 3 || raw.length > 80 || !OK.test(raw)) return reply(400, { error: 'Please enter a city and state, like "St. George, Utah".' });
    const city = await findCity(raw);
    return reply(200, { city: city.name, osmId: city.osmId });
  } catch (err) {
    if (err instanceof GeoError) return reply(502, { error: err.message });
    console.log('neighborhood-planner failed', err && err.stack ? err.stack : String(err));
    return reply(500, { error: 'Something went wrong on our side. Please try again in a few minutes.' });
  }
}
