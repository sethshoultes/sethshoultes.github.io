// The Radar plugin's edge half (superintelligentfoo#94), served from the plugin chain. `data` is radar-data.json, written at
// build time by plugin.py: { config: { collect_url?, key_var, ingest_url?, ingest_key_var } }.
//   any GET, with ingest_url and the ingest key set (0.2, site-kit#426): a request from a known AI crawler (by its user agent),
//                     or a page request referred by a known AI host from a browser that has not asked not to be tracked, sends
//                     the Radar service one event the edge builds itself: {kind, bot or source, path, ts}, and nothing else (no
//                     IP, no user agent, no cookie, no visitor id; ALLOWED below, pinned by a test). The path is the request's
//                     own, without its query string, only when the site answered it with a shared page (a 200 HTML page, or a
//                     304 for a page path, with Cache-Control public and not private or no-store); anything else is "(other)". Sent in waitUntil, never retried, dropped on any error; the
//                     page is served exactly as it would be without it. No ingest key set: nothing is sent.
//   POST /api/radar   a page view from radar.js, passed on server to server to the site's Radar collector (collect_url, and
//                     only there: nothing in the request picks the target) with the site key from the env var named by
//                     key_var and the visitor's IP and User-Agent as headers. The body is never forwarded as it came: the edge
//                     reads {url, referrer} from it (at most 4096 bytes) and sends only a body it builds itself,
//                     {"url": origin + path, "referrer": the referrer's origin or ""}; a page address on another origin than
//                     this site's, or a body that is not a JSON object, is dropped. The browser always gets 204, no body, no
//                     cookie, whatever the collector says; the forward runs in waitUntil so the page never waits. No key set,
//                     or a request with Sec-GPC: 1 or DNT: 1 (or yes): 204 and nothing is sent.
//   any other GET     the page, with radar.js added (0.1.1). Radar is a true no-op until the site key exists: the key is a Pages
//                     secret, visible only here at runtime and never at build time, so the build adds nothing to any page and
//                     the edge adds the script. No key set (missing or empty): null, the page is never even fetched and is
//                     served exactly as built. With the key: an HTML (text/html) 200 page gets one
//                     <script defer src="/assets/plugins/radar/assets/radar.js"></script> appended at the end of <body>, status
//                     and headers kept (but Content-Length, ETag and Last-Modified, which describe the page as built; and a
//                     conditional request for a page path (isPage) reaches the origin without If-None-Match /
//                     If-Modified-Since, so a copy cached before the key was set is never kept as current; any other path,
//                     an asset, keeps them and its 304, 0.1.2). A page that already holds that tag does not get a
//                     second. Any other response (not HTML, not 200: an image, JSON, CSS, radar.js itself, a 404, a
//                     redirect) comes back as it came. Never the key: it goes only to the collector, never into a page.
// Other methods on any other path (HEAD included): null, so the page or the next plugin answers. Other methods on /api/radar:
// 405.
// A POST from another origin (sameOrigin below): 403. Nothing is logged but the collector's status code: never the key, the IP or
// the User-Agent.

export const PATH = "/api/radar";
// The only fields an ingest event may carry (the lead's condition on site-kit#426): crawler events name the bot, referral
// events the source, campaign events (0.3, radar#51, site-kit#429) the cleaned utm_source, utm_medium and utm_campaign.
export const ALLOWED = {
  crawler: ["kind", "bot", "path", "ts"],
  ai_referral: ["kind", "source", "path", "ts"],
  campaign: ["kind", "source", "medium", "campaign", "path", "ts"],
};
export const OTHER = "(other)";
// The path rule Radar's ingest holds (radar#50, radar#53): printable ASCII with no query, fragment, space or backslash, at most
// 512 characters, and a % only as an escape of such a character. A path past it (a UTF-8 slug like /caf%C3%A9) goes as (other),
// so one page never makes Radar refuse the whole batch (mi-dev-4 on radar#53).
export const RADAR_PATH = /^\/[\x21\x22\x24-\x3e\x40-\x5b\x5d-\x7e]{0,511}$/;
export const BAD_ESCAPE = /%(?![0-9a-f]{2})|%(?:[01][0-9a-f]|2[035]|3f|5c|7f|[89a-f][0-9a-f])/i;
export const sendable = (path) => RADAR_PATH.test(path) && !BAD_ESCAPE.test(path);
// A UTM value as Radar keeps it: lowercase [a-z0-9._-], 1 to 64 characters. Anything else is dropped (radar#51).
export const UTM = /^[a-z0-9._-]{1,64}$/;
// A UTM value that may name a person rather than a campaign, Radar's own rule (radar#55, workers/api/src/ingest.ts), so the
// value never leaves the site: such a visit is sent as the (other) campaign. A dot is where names, addresses and domains hide
// (first.last, jane.doe.acme.nl, promo-jane.doe), so a value with a dot is kept only when it is a known referrer host (exact) or
// a single label on com/net/org/io/co/ai/app/dev (google.com, t.co, mailchimp.com). Without a dot it is a person's for a mail
// provider's name, seven or more digits not counting one real date (a phone, account or order number), a hex run of 16, or a
// part (between _ -) of 24 or more characters (a token). An underscore or dash name (jane_doe) can't be told from a campaign
// word (black_friday) and passes, as it does at Radar.
const KNOWN_HOSTS = new Set(["m.facebook.com", "l.facebook.com", "lm.facebook.com", "news.ycombinator.com", "old.reddit.com", "out.reddit.com", "l.instagram.com"]);
const DOMAIN = /^[a-z0-9-]+\.(?:com|net|org|io|co|ai|app|dev)$/;
const PERSONAL = [
  /(^|[._-])(gmail|googlemail|yahoo|ymail|hotmail|outlook|icloud|aol|proton|protonmail|gmx)([._-]|$)/,
  /[0-9a-f]{16}/,
  /(^|[._-])[a-z0-9]{24}/,
];
// One real date (2026-11, 2026-11-17, 20261117), a whole part with a 19xx or 20xx year and a real month and day: its digits
// don't count toward seven. A phone that starts like a year (2025551234) is no date.
const DATE = /(?:^|[._-])(?:19|20)\d\d[._-]?(?:0[1-9]|1[0-2])(?:[._-]?(?:0[1-9]|[12]\d|3[01]))?(?=[._-]|$)/;
export const personal = (v) => (v.includes(".") ? !KNOWN_HOSTS.has(v) && !DOMAIN.test(v) : false)
  || (v.replace(DATE, "").match(/[0-9]/g)?.length ?? 0) >= 7 || PERSONAL.some((re) => re.test(v));
export const OTHER_CAMPAIGN = { source: OTHER, medium: "", campaign: "" };
// One UTM parameter, lowercased and held to UTM, or "" when it is missing, repeated or past the rule.
function utm(params, name) {
  const all = params.getAll(name);
  if (all.length !== 1) return "";
  const v = all[0].toLowerCase();
  return UTM.test(v) ? v : "";
}
// The campaign a page request's URL names, or null when it carries no usable utm_source. Only utm_source, utm_medium and
// utm_campaign are read: never utm_term, utm_content, a click id, or any other parameter.
export function campaignOf(url) {
  const params = new URL(url).searchParams;
  const source = utm(params, "utm_source");
  if (!source) return null;
  const found = { source, medium: utm(params, "utm_medium"), campaign: utm(params, "utm_campaign") };
  return { kind: "campaign", ...([found.source, found.medium, found.campaign].some(personal) ? OTHER_CAMPAIGN : found) };
}
// Known AI crawlers, by a lowercase piece of their user agent, and the name Radar counts them under. An unlisted bot sends
// nothing. Google-Extended and Applebot-Extended are robots.txt tokens, not user agents, so no request carries them.
export const BOTS = [
  ["oai-searchbot", "oai-searchbot"], ["chatgpt-user", "chatgpt-user"], ["gptbot", "gptbot"],
  ["claude-searchbot", "claude-searchbot"], ["claude-user", "claude-user"], ["claudebot", "claudebot"],
  ["perplexity-user", "perplexity-user"], ["perplexitybot", "perplexitybot"], ["bingbot", "bingbot"], ["ccbot", "ccbot"],
  ["bytespider", "bytespider"], ["meta-externalagent", "meta-externalagent"], ["amazonbot", "amazonbot"],
];
// Known AI hosts a visitor arrives from, by the referrer's exact host, and the source name Radar counts them under.
export const SOURCES = {
  "chatgpt.com": "chatgpt.com", "chat.openai.com": "chatgpt.com", "perplexity.ai": "perplexity.ai", "www.perplexity.ai": "perplexity.ai",
  "gemini.google.com": "gemini.google.com", "claude.ai": "claude.ai", "copilot.microsoft.com": "copilot.microsoft.com",
};
export const MAX_BODY = 4096;
// The longest User-Agent passed on, the collector's own cap (superintelligentfoo radar MAX_USER_AGENT_LENGTH), so no more is ever
// sent than it keeps (0.1.2).
export const MAX_UA = 512;
export const SCRIPT_SRC = "/assets/plugins/radar/assets/radar.js";
export const TAG = `<script defer src="${SCRIPT_SRC}"></script>`;

// A path a page is served at: one ending in "/" or ".html", or whose last segment has no extension (Pages serves /about for
// about.html). Every asset has an extension, so it is never one.
export const isPage = (pathname) => pathname.endsWith("/") || pathname.endsWith(".html") || !/\.[^/]*$/.test(pathname);

// A request a browser makes for a page: a navigation (Sec-Fetch-Dest: document or iframe) or one that accepts text/html. That
// catches a page at a dotted path (/releases/v1.2 for v1.2.html), which isPage cannot tell from an asset; an <img>, <script> or
// stylesheet load sends neither.
export const wantsPage = (request) => {
  const dest = request.headers.get("Sec-Fetch-Dest");
  return dest === "document" || dest === "iframe" || (request.headers.get("Accept") || "").toLowerCase().includes("text/html");
};

const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
const plain = (status, extra = {}) => new Response(null, { status, headers: { "Cache-Control": "no-store", ...extra } });

// The body's bytes, or null if it is over max. Reads at most max + 1 bytes of the stream, so a huge body is never buffered. A
// stream that errors (a dropped connection, a body already read) gives no bytes, so the beacon is dropped with 204, never a
// throw (0.1.2).
async function capped(request, max) {
  const length = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(length) && length > max) return null;
  if (!request.body) return new Uint8Array(0);
  let reader;
  const chunks = [];
  let size = 0;
  for (;;) {
    let step;
    try {
      reader ??= request.body.getReader();
      step = await reader.read();
    } catch {
      return new Uint8Array(0);
    }
    const { done: end, value } = step;
    if (end) break;
    size += value.byteLength;
    if (size > max) {
      reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

// Same-origin: the Origin header names this site. A page with Referrer-Policy: no-referrer sends Origin "null" (or none) on its
// own POSTs, so then the browser's own Sec-Fetch-Site must say same-origin; a script cannot set either header.
function sameOrigin(request, url) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== "null") return origin === url.origin;
  return request.headers.get("Sec-Fetch-Site") === "same-origin";
}

// The body the edge sends, built from the browser's {url, referrer}, or null to drop the beacon: not a JSON object, no url, or a
// url that is not a page of this site. Every other field is dropped, and no query string or fragment survives.
function pageView(bytes, site) {
  let given;
  try {
    given = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  if (!given || typeof given !== "object" || Array.isArray(given) || typeof given.url !== "string") return null;
  let page;
  try {
    page = new URL(given.url);
  } catch {
    return null;
  }
  if (page.origin !== site) return null;
  let referrer = "";
  if (typeof given.referrer === "string" && given.referrer) {
    try {
      const origin = new URL(given.referrer).origin;
      referrer = origin !== "null" ? origin : "";
    } catch {
      referrer = "";
    }
  }
  return JSON.stringify({ url: page.origin + page.pathname, referrer });
}

// Global Privacy Control, or Do Not Track as "1" or the older "yes" (0.1.2), in any case and with spaces trimmed.
const optedOut = (request) => {
  const dnt = (request.headers.get("DNT") || "").trim().toLowerCase();
  return (request.headers.get("Sec-GPC") || "").trim() === "1" || dnt === "1" || dnt === "yes";
};

async function forward(url, headers, body) {
  try {
    const res = await fetch(url, { method: "POST", headers, body, redirect: "manual" });
    if (res.status !== 202) console.log(JSON.stringify({ plugin: "radar", collector: res.status }));
  } catch {
    console.log(JSON.stringify({ plugin: "radar", collector: "unreachable" }));
  }
}

// The site key from the env var key_var names, trimmed, or null when it is missing, empty or only whitespace (0.1.2).
function siteKey(env, config) {
  const key = config.key_var ? env?.[config.key_var] : undefined;
  const trimmed = typeof key === "string" ? key.trim() : "";
  return trimmed || null;
}

// The page with radar.js at the end of <body>, or the response as it came when it is not an HTML 200. newRewriter() makes an
// HTMLRewriter (a factory, so a test can hand in a fake). The script element handler sees an existing tag before </body> is
// reached (a streaming rewrite meets elements in document order), so the end-tag handler adds the tag only when none was there.
async function inject(context, newRewriter) {
  // The page now depends on the key, so never answer 304 from a copy a browser cached before the key was set: the origin is asked
  // for the full page. Done here, before radar's own next(), as content-blocks and location-picker do: the chain ignores
  // next(req)'s req once an earlier plugin has answered (that plugin already stripped them itself).
  // Only for a page (0.1.2): a page path, or a request a browser makes for a page. An image, a stylesheet or a script never gets
  // the tag, so its own validators stay true and it keeps its 304 (sethshoultes/site-kit#51, mi-dev-3's read: stripping them on
  // every GET re-downloaded every asset).
  let fresh = context.request;
  if (isPage(new URL(context.request.url).pathname) || wantsPage(context.request)) {
    fresh = new Request(context.request);
    fresh.headers.delete("if-none-match");
    fresh.headers.delete("if-modified-since");
  }
  const res = await context.next(fresh);
  if (res.status !== 200 || !(res.headers.get("content-type") || "").startsWith("text/html")) return res;
  let present = false;
  const out = newRewriter()
    .on(`script[src="${SCRIPT_SRC}"]`, { element() { present = true; } })
    .on("body", {
      element(el) {
        el.onEndTag((end) => {
          if (!present) end.before(TAG, { html: true });
          present = true;
        });
      },
    })
    .transform(res);
  // The body changed: the old length is wrong, and the built page's validators describe other bytes, so a copy cached before the
  // key was set is never revalidated as current (as location-picker and content-blocks drop them).
  const headers = new Headers(out.headers);
  headers.delete("content-length");
  headers.delete("etag");
  headers.delete("last-modified");
  return new Response(out.body, { status: out.status, statusText: out.statusText, headers });
}

// What this request is to Radar's ingest: a known AI crawler, or a page visit from a browser that has not opted out that a known
// AI host referred, or else that a campaign link (utm_source) brought, or null. A crawler is counted whatever DNT or GPC say: a
// crawler is not a person.
export function classify(request) {
  const ua = (request.headers.get("User-Agent") || "").toLowerCase();
  for (const [needle, bot] of BOTS) if (ua.includes(needle)) return { kind: "crawler", bot };
  const path = new URL(request.url).pathname;
  if (!(isPage(path) || wantsPage(request)) || optedOut(request)) return null;
  let host = "";
  try {
    host = new URL(request.headers.get("Referer") || "").hostname;
  } catch {
    // no referrer, or not a URL: not an AI referral, but it may still be a campaign
  }
  const source = Object.hasOwn(SOURCES, host) ? SOURCES[host] : null;
  return source ? { kind: "ai_referral", source } : campaignOf(request.url);
}

// The event, with the path only when the site served a shared page there: a 200 HTML page, or a 304 for a page path, whose
// Cache-Control says public (Cloudflare Pages' own "public, max-age=0, must-revalidate") and neither private nor no-store.
// A missing, empty or malformed header fails closed (mi-dev-3 on #427). A search URL, a token in a link, a mistyped path, or
// a page for one person (a member's own page, which the members gate serves private, no-store; mi-dev-4 on radar#49) is
// never sent as typed: it goes as (other). The query string never is.
export function eventOf(found, request, res, now) {
  const path = new URL(request.url).pathname;
  const cc = res.headers.get("cache-control") || "";
  const shared = /(^|[,;\s])public([,;\s]|$)/i.test(cc) && !/(^|[,;\s])(private|no-store)([,;\s=]|$)/i.test(cc);
  const page = shared && ((res.status === 200 && (res.headers.get("content-type") || "").startsWith("text/html")) || (res.status === 304 && isPage(path)));
  const ev = { ...found, path: page && sendable(path) ? path : OTHER, ts: Math.floor(now / 1000) };
  return Object.fromEntries(ALLOWED[ev.kind].map((k) => [k, ev[k]]));   // only the allowed fields, in their order
}

async function ingest(url, key, events) {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(events), redirect: "manual" });
    if (!res.ok) console.log(JSON.stringify({ plugin: "radar", ingest: res.status }));   // Radar answers 204; any 2xx is taken
  } catch {
    console.log(JSON.stringify({ plugin: "radar", ingest: "unreachable" }));
  }
}

// The ingest key from the env var ingest_key_var names, trimmed, or null.
function ingestKey(env, config) {
  const key = config.ingest_key_var ? env?.[config.ingest_key_var] : undefined;
  const trimmed = typeof key === "string" ? key.trim() : "";
  return trimmed || null;
}

export async function handle(context, data, newRewriter = () => new HTMLRewriter(), now = () => Date.now()) {
  const { request, env } = context;
  const url = new URL(request.url);
  const config = (data && data.config) || {};
  if (url.pathname !== PATH) {
    if (request.method !== "GET") return null;
    const key = config.ingest_url ? ingestKey(env, config) : null;
    const found = key ? classify(request) : null;
    const collecting = Boolean(config.collect_url && siteKey(env, config));
    if (!found && !collecting) return null;
    const res = collecting ? await inject(context, newRewriter) : await context.next();
    if (found) {
      const sending = ingest(config.ingest_url, key, [eventOf(found, request, res, now())]);
      if (typeof context.waitUntil === "function") context.waitUntil(sending);
    }
    return res;
  }
  if (request.method !== "POST") return plain(405, { Allow: "POST" });
  if (!sameOrigin(request, url)) return plain(403);
  if (optedOut(request)) return done();
  const raw = await capped(request, MAX_BODY);
  if (raw === null) return plain(413);
  const key = siteKey(env, config);
  if (!key || !config.collect_url) return done();
  const body = pageView(raw, url.origin);
  if (body === null) return done();
  const headers = { "Content-Type": "text/plain", "X-Radar-Site-Key": key };
  const ip = request.headers.get("CF-Connecting-IP");
  const ua = request.headers.get("User-Agent");
  if (ip) headers["X-Radar-Client-IP"] = ip;
  if (ua) headers["X-Radar-Client-UA"] = ua.slice(0, MAX_UA);
  const sending = forward(config.collect_url, headers, body);
  if (typeof context.waitUntil === "function") context.waitUntil(sending);
  return done();
}
