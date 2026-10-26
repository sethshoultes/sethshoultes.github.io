// Google Maps data through Gemini's "Grounding with Google Maps" tool, using the
// Gemini key already used for the AI-visibility tool. Gemini reads Maps and
// reports what it shows; the grounding chunks name the places it actually used,
// with their Maps links. A listing counts only when its name matches one of
// those chunks, so a name the model made up cannot get through. Figures are
// what Maps shows, passed on by the model, and the page links each listing so
// they can be checked.

const TIMEOUT_MS = 28000;
const MODEL = 'gemini-2.5-flash';

export class MapsError extends Error {}

export async function askMaps(env, prompt) {
  if (!env.GEMINI_API_KEY) throw new MapsError('Google Maps lookups are not set up right now.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ googleMaps: {} }] }),
      signal: controller.signal,
    });
    if (!res.ok) throw new MapsError(`Google Maps answered ${res.status}.`);
    const json = await res.json();
    const cand = json.candidates && json.candidates[0];
    const text = ((cand && cand.content && cand.content.parts) || []).map((p) => p.text || '').join('');
    return { text, places: placesFrom(cand && cand.groundingMetadata) };
  } catch (err) {
    if (err instanceof MapsError) throw err;
    throw new MapsError(err.name === 'AbortError' ? 'Google Maps took too long to answer.' : 'Google Maps could not be reached.');
  } finally {
    clearTimeout(timer);
  }
}

// One entry per place Maps actually returned: its name, id and listing link.
export function placesFrom(meta) {
  const byId = new Map();
  for (const chunk of (meta && meta.groundingChunks) || []) {
    const m = chunk && chunk.maps;
    if (!m || !m.placeId || !m.title || /^review of /i.test(m.title)) continue;
    if (byId.has(m.placeId)) continue;
    const url = typeof m.uri === 'string' && /^https:\/\/(www\.)?google\.com\/maps|^https:\/\/maps\.google\.com\//.test(m.uri) ? m.uri : null;
    byId.set(m.placeId, { placeId: m.placeId, name: m.title.replace(/\s*-\s*Google Maps\s*$/i, '').trim(), url });
  }
  return [...byId.values()];
}

// The model is told to answer with JSON only; this reads it, fenced or not.
export function readJson(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(body);
  } catch {
    const start = body.search(/[[{]/);
    if (start < 0) return null;
    try { return JSON.parse(body.slice(start)); } catch { return null; }
  }
}

export const num = (v, lo, hi) => (typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? v : null);
export const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
