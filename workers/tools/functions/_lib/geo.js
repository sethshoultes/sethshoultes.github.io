// Public data for the neighborhood planner. Three free sources, each used for
// one thing: OpenStreetMap (Nominatim) for a city's boundary, the Census geocoder for the census tract a point sits in, and Census Reporter
// (which serves the American Community Survey) for that tract's housing facts.
// The neighborhood list itself comes from OpenStreetMap's Overpass service, which
// can take 40 seconds, so the visitor's browser asks it directly (see
// assets/tools/neighborhood-page-planner.js) and sends the list here to be joined.
// A source that fails is reported as failed; nothing is estimated.

const UA = 'SethShoultesToolsBot/1.0 (+https://sethshoultes.com/tools/)';
const TIMEOUT_MS = 12000;

export class GeoError extends Error {}

async function getJson(url, init = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, headers: { 'User-Agent': UA, Accept: 'application/json, */*', ...(init.headers || {}) } });
    if (!res.ok) throw new Error(`${new URL(url).hostname} answered ${res.status}`);
    return await res.json();
  } catch (err) {
    console.log('geo fetch failed', String(err && err.message));
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function findCity(query) {
  let hits;
  try {
    hits = await getJson(`https://nominatim.openstreetmap.org/search?format=json&limit=10&countrycodes=us&q=${encodeURIComponent(query)}`);
  } catch {
    throw new GeoError('The map lookup is not answering right now. Please try again in a few minutes.');
  }
  // Searches like "Washington, Utah" also match the county, so only a city, town or village counts.
  const city = hits.find((h) => h.osm_type === 'relation' && h.class === 'boundary' && h.type === 'administrative' && ['city', 'town', 'village'].includes(h.addresstype));
  if (!city) throw new GeoError('We could not find that city. Try the form "St. George, Utah".');
  return { osmId: Number(city.osm_id), name: city.display_name.split(',').slice(0, 2).join(',').trim(), lat: Number(city.lat), lon: Number(city.lon) };
}

export async function tractFor(lat, lon) {
  try {
    const j = await getJson(`https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&format=json`);
    const t = j.result?.geographies?.['Census Tracts']?.[0];
    return t ? { geoid: `${t.STATE}${t.COUNTY}${t.TRACT}`, name: t.NAME } : null;
  } catch {
    return null;
  }
}

// ACS 5-year: B25035 median year built, B25001 housing units, B25077 median home value.
export async function tractFacts(geoids) {
  if (!geoids.length) return { facts: {}, release: null };
  const ids = geoids.map((g) => `14000US${g}`).join(',');
  let data;
  try {
    data = await getJson(`https://api.censusreporter.org/1.0/data/show/latest?table_ids=B25035,B25001,B25077&geo_ids=${ids}`);
  } catch {
    throw new GeoError('The Census figures are not answering right now. Please try again in a few minutes.');
  }
  const facts = {};
  for (const [id, t] of Object.entries(data.data || {})) {
    const num = (table, col) => {
      const v = t[table]?.estimate?.[col];
      return typeof v === 'number' && v > 0 ? v : null;
    };
    facts[id.replace('14000US', '')] = { medianYearBuilt: num('B25035', 'B25035001'), housingUnits: num('B25001', 'B25001001'), medianValue: num('B25077', 'B25077001') };
  }
  return { facts, release: data.release?.name || 'American Community Survey 5-year' };
}
