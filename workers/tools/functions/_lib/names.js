// Splits an assistant's answer into its prose and the names it listed, and
// decides whether a given business is one of them.
//
// "Named" means one entry in the assistant's own NAMES list is the business's
// full name. Both sides are lowercased, stripped of punctuation and of words like
// LLC, Inc, "the" and the state, and then must be equal. A longer name ("St George
// Plumbing Pros" for "St George Plumbing") is a different business, so it does
// not count. Prose is never searched: an answer with no list cannot be judged.

const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const GENERIC = new Set(['llc', 'inc', 'co', 'company', 'the', 'ut', 'utah']);

export function splitAnswer(text) {
  const lines = text.split(/\r?\n/);
  const at = lines.map((l) => /^\s*\**\s*NAMES\s*:/i.test(l)).lastIndexOf(true);
  if (at < 0) return { prose: text.trim(), names: null };
  const names = lines[at].replace(/^\s*\**\s*NAMES\s*:\s*\**/i, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').split('|')
    .map((n) => n.replace(/[*_`]/g, '').trim()).filter(Boolean).slice(0, 8);
  return { prose: lines.slice(0, at).join('\n').trim(), names: names.length ? names : null };
}

const core = (s) => norm(s).split(' ').filter((w) => w && !GENERIC.has(w)).join(' ');

export function isSame(a, b) {
  const x = core(a);
  return x !== '' && x === core(b);
}

// null when there is no list to check; otherwise true or false.
export function isNamed(business, names) {
  if (!names) return null;
  return names.some((n) => isSame(business, n));
}

// A name made only of words that say nothing about which business it is: legal
// endings, the state, or words that are the service or the city. "Plumbing" for a
// plumber in St. George, or "St. George Utah", would match any competitor. Words
// count as the same when they share their first five letters (plumbing, plumber).
export function isGenericName(business, service, city) {
  const stem = (w) => w.slice(0, 5);
  const common = new Set([...norm(`${service} ${city}`).split(' ').filter(Boolean).map(stem)]);
  const words = core(business).split(' ').filter(Boolean);
  return words.length === 0 || words.every((w) => common.has(stem(w)) || w === 'and');
}
