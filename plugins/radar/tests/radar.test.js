// plugins/radar/assets/radar.js: one beacon per page view to /api/radar, {"url", "referrer"} and nothing else (the page's origin
// and path, never its query string or fragment; the referrer's origin only), by sendBeacon (fetch
// keepalive when that is missing or refuses); nothing at all under Global Privacy Control or Do Not Track; a prerendered page
// counts only once it is shown. Runs radar.js itself against a fake window, document and navigator that throw on any read of
// cookies or storage, so the test fails if radar.js ever touches them.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const SOURCE = fs.readFileSync(path.join(__dirname, "..", "assets", "radar.js"), "utf8");
// The page has a query string and a fragment; location.href, .search and .hash throw if read, so neither can leave the site.
const PAGE = { origin: "https://smores.example", pathname: "/recipes/classic" };
const URL_SENT = "https://smores.example/recipes/classic";
const REFERRER = "https://www.google.com/search?q=smores&email=x#top";
const REFERRER_SENT = "https://www.google.com";

function guarded(obj, names, what) {
  for (const name of names) Object.defineProperty(obj, name, { get() { throw new Error(`radar.js read ${what}.${name}`); } });
  return obj;
}

// Runs radar.js once. `nav` adds to the fake navigator (sendBeacon records by default); `doc` to the fake document.
function run({ nav = {}, doc = {}, win = {}, beacon = true, fetchThrows = false, page = PAGE } = {}) {
  const beacons = [];
  const fetches = [];
  const listeners = {};
  const navigator = guarded({ userAgent: "UA", ...(beacon ? { sendBeacon: (url, body) => { beacons.push({ url, body }); return beacon !== "refuse"; } } : {}), ...nav },
    ["cookieEnabled", "language", "languages", "plugins", "hardwareConcurrency", "deviceMemory", "storage", "geolocation"], "navigator");
  const document = guarded({ referrer: REFERRER, prerendering: false, ...doc,
    addEventListener(type, fn, opts) { (listeners[type] = listeners[type] || []).push({ fn, opts }); } }, ["cookie"], "document");
  const fetch = (url, init) => { if (fetchThrows) throw new Error("no fetch"); fetches.push({ url, init }); return Promise.resolve(new Response(null, { status: 204 })); };
  const location = guarded({ ...page }, ["href", "search", "hash"], "location");
  const window = guarded({ navigator, location, fetch, ...win }, ["localStorage", "sessionStorage", "indexedDB", "screen", "caches"], "window");
  new Function("window", "document", "navigator", "location", "fetch", "localStorage", "sessionStorage", SOURCE)(
    window, document, navigator, window.location, fetch, undefined, undefined);
  return { beacons, fetches, listeners };
}

const EXACT = JSON.stringify({ url: URL_SENT, referrer: REFERRER_SENT });

test("one beacon to the site's own /api/radar with exactly {url, referrer}: origin + path, and the referrer's origin", () => {
  const { beacons, fetches } = run();
  assert.deepStrictEqual(beacons, [{ url: "/api/radar", body: EXACT }]);
  assert.deepStrictEqual(Object.keys(JSON.parse(beacons[0].body)), ["url", "referrer"]);
  assert.strictEqual(fetches.length, 0);
});

test("a page address with ?email=x#y goes as origin + path only; a referrer with a path and query goes as its origin only", () => {
  // As a browser fills location from https://smores.example/join/thanks?email=x#y.
  const page = { origin: "https://smores.example", pathname: "/join/thanks" };
  const { beacons } = run({ page, doc: { referrer: "https://news.example:8443/story/42?email=x&utm_source=y#comments" } });
  assert.strictEqual(beacons[0].body, JSON.stringify({ url: "https://smores.example/join/thanks", referrer: "https://news.example:8443" }));
  assert.ok(!beacons[0].body.includes("email") && !beacons[0].body.includes("?") && !beacons[0].body.includes("#"));
});

test("a referrer that is absent or cannot be read as an address is sent as an empty string", () => {
  for (const referrer of ["", "not a url", "about:blank", "data:text/html,hi"]) {
    const { beacons } = run({ doc: { referrer } });
    assert.deepStrictEqual(JSON.parse(beacons[0].body), { url: URL_SENT, referrer: "" }, referrer);
  }
});

test("nothing is sent under Global Privacy Control or Do Not Track", () => {
  for (const [nav, win] of [[{ globalPrivacyControl: true }, {}], [{ doNotTrack: "1" }, {}], [{}, { doNotTrack: "1" }],
    [{ globalPrivacyControl: true, doNotTrack: "1" }, {}], [{ doNotTrack: "yes" }, {}], [{ msDoNotTrack: "1" }, {}]]) {
    const { beacons, fetches, listeners } = run({ nav, win });
    assert.deepStrictEqual([beacons, fetches], [[], []], JSON.stringify({ nav, win }));
    assert.deepStrictEqual(listeners, {}, "and nothing waits to send later");
  }
});

test("GPC off and DNT unset or 0 still count", () => {
  for (const nav of [{ globalPrivacyControl: false }, { doNotTrack: "0" }, { doNotTrack: "unspecified" }, { doNotTrack: null }, { doNotTrack: "no" }, { msDoNotTrack: "0" }]) {
    assert.strictEqual(run({ nav }).beacons.length, 1, JSON.stringify(nav));
  }
});

test("without sendBeacon, or when it refuses, the same body goes by fetch keepalive, text/plain, no credentials", () => {
  for (const beacon of [false, "refuse"]) {
    const { fetches } = run({ beacon });
    assert.strictEqual(fetches.length, 1, String(beacon));
    const [{ url, init }] = fetches;
    assert.strictEqual(url, "/api/radar");
    assert.deepStrictEqual(init, { method: "POST", body: EXACT, keepalive: true, credentials: "omit", headers: { "Content-Type": "text/plain" } });
  }
});

test("a sendBeacon or fetch that throws never surfaces an error to the page", () => {
  assert.doesNotThrow(() => run({ nav: { sendBeacon: () => { throw new Error("blocked"); } }, fetchThrows: true }));
});

test("a prerendered page sends nothing until it is shown, then exactly one beacon", () => {
  const { beacons, listeners } = run({ doc: { prerendering: true } });
  assert.strictEqual(beacons.length, 0);
  assert.strictEqual(listeners.prerenderingchange.length, 1);
  assert.deepStrictEqual(listeners.prerenderingchange[0].opts, { once: true });
  listeners.prerenderingchange[0].fn();
  assert.deepStrictEqual(beacons, [{ url: "/api/radar", body: EXACT }]);
});

test("radar.js names no cookie, storage or other identifier at all", () => {
  for (const word of ["cookie", "localStorage", "sessionStorage", "indexedDB", "screen", "userAgent", "crypto", "random"]) {
    assert.ok(!SOURCE.replace(/^\s*\/\/.*$/gm, "").includes(word), word);
  }
});
