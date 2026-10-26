// Splits an assistant's answer into its prose and the names it listed, and
// decides whether a given business is among them.

const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
const GENERIC = new Set(['llc', 'inc', 'co', 'company', 'ut', 'utah']);

export function splitAnswer(text) {
  const lines = text.split(/\r?\n/);
  const at = lines.map((l) => /^\s*\**\s*NAMES\s*:/i.test(l)).lastIndexOf(true);
  if (at < 0) return { prose: text.trim(), names: null };
  const names = lines[at].replace(/^\s*\**\s*NAMES\s*:\s*\**/i, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').split('|')
    .map((n) => n.replace(/[*_`]/g, '').trim()).filter(Boolean).slice(0, 8);
  return { prose: lines.slice(0, at).join('\n').trim(), names: names.length ? names : null };
}

// Named means the business's name appears as consecutive whole words in the
// answer, ignoring LLC, Inc, the state and similar. The words must sit
// together and in order, so "Zion Plumbing" is not found in "Marlin Plumbing and
// Zion Heating".
const core = (s) => norm(s).split(' ').filter((w) => w && !GENERIC.has(w)).join(' ');

export function isNamed(business, text) {
  const want = core(business);
  return Boolean(want) && ` ${core(text)} `.includes(` ${want} `);
}

export function isSame(a, b) {
  return norm(a) === norm(b) || isNamed(a, b) || isNamed(b, a);
}
