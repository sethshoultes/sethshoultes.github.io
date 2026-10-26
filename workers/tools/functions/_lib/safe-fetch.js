// Fetches a public web page for a tool. A visitor controls the address, so
// every hop is checked: web schemes and ports only, no credentials, no IP
// literals or internal names, and every address the name resolves to must be
// public. Redirects are followed by hand so each hop is checked again, and the
// body is read up to a byte cap with a time limit.
//
// Known limit: Workers cannot pin the address a fetch connects to, so a name
// that changes its answer between the lookup here and the connection is not
// caught by this check. The platform covers that case: a Worker connects from
// Cloudflare's edge and cannot reach private or loopback ranges at all.

export class FetchError extends Error {}

const USER_AGENT = 'SethShoultesToolsBot/1.0 (+https://sethshoultes.com/tools/)';
const BLOCKED_SUFFIXES = ['.local', '.localhost', '.internal', '.localdomain', '.lan', '.home.arpa', '.intranet', '.corp'];

export function parseTarget(input) {
  let text = typeof input === 'string' ? input.trim() : '';
  if (!text || text.length > 2048) throw new FetchError('Enter a website address, like example.com.');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) text = `https://${text}`;
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new FetchError('That does not look like a website address.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchError('Only http and https addresses work.');
  if (url.username || url.password) throw new FetchError('Leave the username and password out of the address.');
  if (url.port) throw new FetchError('Only standard web ports work.');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host.includes(':') || host.startsWith('[')) throw new FetchError('Use a website name, not a number.');
  if (/^[0-9.]+$/.test(host) || /^0x/i.test(host)) throw new FetchError('Use a website name, not a number.');
  if (!host.includes('.') || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) throw new FetchError('That is not a public website.');
  return url;
}

function expandV6(ip) {
  if (ip.includes('.') || (ip.match(/::/g) || []).length > 1) return null;
  const [left, right] = ip.split('::');
  const l = left ? left.split(':') : [];
  const r = right === undefined ? [] : right ? right.split(':') : [];
  const fill = right === undefined ? 0 : 8 - l.length - r.length;
  if (fill < 0 || (right === undefined && l.length !== 8)) return null;
  const groups = [...l, ...Array(fill).fill('0'), ...r].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff) ? groups : null;
}

// Public means global unicast (2000::/3), minus the ranges inside it that are
// not routed to a real host: documentation, Teredo, 6to4 and benchmarking.
export function isPrivateIp(ip) {
  if (ip.includes(':')) {
    const g = expandV6(ip.toLowerCase());
    if (!g) return true;
    if (g[0] < 0x2000 || g[0] > 0x3fff) return true;
    if (g[0] === 0x2002) return true;
    if (g[0] === 0x2001 && (g[1] === 0 || g[1] === 0xdb8 || (g[1] >= 0x10 && g[1] <= 0x2f))) return true;
    return false;
  }
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !(n >= 0 && n <= 255))) return true;
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

async function dohAddresses(host, type) {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
    headers: { Accept: 'application/dns-json' },
  });
  if (!res.ok) throw new FetchError('Could not look that website up.');
  const json = await res.json();
  const want = type === 'A' ? 1 : 28;
  return (json.Answer || []).filter((a) => a.type === want).map((a) => a.data);
}

export async function resolveHost(host) {
  const [v4, v6] = await Promise.all([dohAddresses(host, 'A'), dohAddresses(host, 'AAAA')]);
  return [...v4, ...v6];
}

async function readCapped(response, maxBytes) {
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      chunks.push(value.slice(0, value.length - (size - maxBytes)));
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.length; }
  return { text: new TextDecoder().decode(bytes), truncated };
}

export function makeSafeFetch(deps = {}) {
  const doFetch = deps.fetch || fetch;
  const resolve = deps.resolve || resolveHost;
  const cache = new Map();

  async function checkHost(host) {
    if (!cache.has(host)) cache.set(host, resolve(host));
    const addresses = await cache.get(host);
    if (!addresses.length) throw new FetchError('That website name does not point anywhere.');
    if (addresses.some(isPrivateIp)) throw new FetchError('That is not a public website.');
  }

  return async function safeFetch(start, { accept = '*/*', maxBytes = 1_000_000, timeoutMs = 8000, redirects = 3 } = {}) {
    let url = parseTarget(start);
    for (let hop = 0; hop <= redirects; hop += 1) {
      await checkHost(url.hostname.toLowerCase().replace(/\.$/, ''));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await doFetch(url.href, {
          redirect: 'manual',
          signal: controller.signal,
          headers: { 'User-Agent': USER_AGENT, Accept: accept },
        });
        if (res.status >= 300 && res.status < 400 && res.headers.get('Location')) {
          url = parseTarget(new URL(res.headers.get('Location'), url).href);
          continue;
        }
        const { text, truncated } = await readCapped(res, maxBytes);
        return { url: url.href, status: res.status, contentType: res.headers.get('Content-Type') || '', text, truncated };
      } catch (err) {
        if (err instanceof FetchError) throw err;
        throw new FetchError(err.name === 'AbortError' ? 'The website took too long to answer.' : 'Could not reach that website.');
      } finally {
        clearTimeout(timer);
      }
    }
    throw new FetchError('That website redirected too many times.');
  };
}
