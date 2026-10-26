// A small robots.txt reader (RFC 9309): groups by user-agent, longest matching
// rule wins, Allow wins a tie, * and $ work in paths.

export function parseRobots(text) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const at = line.indexOf(':');
    if (at < 0) continue;
    const field = line.slice(0, at).trim().toLowerCase();
    const value = line.slice(at + 1).trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === 'allow' || field === 'disallow') && current) {
      if (value) current.rules.push({ allow: field === 'allow', path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function matches(pattern, path) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${source}${anchored ? '$' : ''}`).test(path);
}

function rulesFor(groups, agent) {
  const own = groups.filter((g) => g.agents.includes(agent));
  if (own.length) return { rules: own.flatMap((g) => g.rules), group: 'own' };
  const star = groups.filter((g) => g.agents.includes('*'));
  if (star.length) return { rules: star.flatMap((g) => g.rules), group: 'star' };
  return { rules: [], group: 'none' };
}

// status: allowed (nothing in the way), partial (the home page is open but some
// paths are closed), blocked (the whole site is closed to this bot).
export function evaluate(groups, bot) {
  const { rules, group } = rulesFor(groups, bot.toLowerCase());
  const hits = rules.filter((r) => matches(r.path, '/'));
  const best = hits.reduce((a, r) => (!a || r.path.length > a.path.length || (r.path.length === a.path.length && r.allow) ? r : a), null);
  const line = (r) => `${r.allow ? 'Allow' : 'Disallow'}: ${r.path}`;
  if (best && !best.allow) return { status: 'blocked', group, rules: [line(best)] };
  const closed = rules.filter((r) => !r.allow && !matches(r.path, '/'));
  if (closed.length) return { status: 'partial', group, rules: closed.slice(0, 5).map(line) };
  return { status: 'allowed', group, rules: [] };
}
