// plugins/radar/edge.js: POST /api/radar passes a page view on to the collector, server to server, with the site key, the
// visitor's IP and User-Agent as headers and a body the edge builds itself from the browser's {url, referrer} (origin + path, and
// the referrer's origin; the page must be on this site), inside waitUntil, always to collect_url with redirect "manual". The
// browser always gets a bare 204: no body, no cookie, never the key. No key set, Sec-GPC: 1 or DNT: 1: nothing is sent. Other
// paths: null. Other methods: 405.
const test = require("node:test");
const assert = require("node:assert");

const COLLECT = "https://foo.example/api/v1/radar/collect";
const DATA = { config: { collect_url: COLLECT, key_var: "RADAR_SITE_KEY" } };
const KEY = "rk_secret_site_key_123";
const IP = "203.0.113.9";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)";
const SITE = "https://smores.example";
const BODY = JSON.stringify({ url: SITE + "/recipes/classic?utm_source=x", referrer: "https://www.google.com/" });
const BUILT = JSON.stringify({ url: SITE + "/recipes/classic", referrer: "https://www.google.com" });

// One request through the edge with a recording fetch and console.log; the waitUntil promises are awaited before returning.
async function ask({ path = "/api/radar", method = "POST", body = BODY, headers = {}, env = { RADAR_SITE_KEY: KEY }, data = DATA,
  answer = () => new Response(null, { status: 202 }), waitUntil = true } = {}) {
  const { handle } = await import("../edge.js");
  const sent = [];
  const logs = [];
  const waits = [];
  const realFetch = globalThis.fetch;
  const realLog = console.log;
  globalThis.fetch = async (url, init) => { sent.push({ url: String(url), init }); return answer(); };
  console.log = (...args) => logs.push(args.join(" "));
  try {
    const request = new Request(SITE + path, { method, body: method === "GET" || method === "HEAD" ? undefined : body,
      headers: { Origin: SITE, "CF-Connecting-IP": IP, "User-Agent": UA, "Content-Type": "text/plain;charset=UTF-8", Cookie: "session=abc", ...headers } });
    const context = { request, env, ...(waitUntil ? { waitUntil: (p) => waits.push(p) } : {}) };
    const res = await handle(context, data);
    await Promise.all(waits);
    await new Promise((r) => setImmediate(r));
    return { res, sent, logs, waits };
  } finally {
    globalThis.fetch = realFetch;
    console.log = realLog;
  }
}

async function bare204(res) {
  assert.strictEqual(res.status, 204);
  assert.strictEqual(res.headers.get("Set-Cookie"), null, "no cookie");
  assert.strictEqual(await res.text(), "", "no body");
  for (const [, v] of res.headers) assert.ok(!v.includes(KEY), "never the key in a header");
}

test("a page view goes to collect_url with the site key, the visitor's IP and User-Agent, text/plain, and the edge's own body", async () => {
  const { res, sent, waits, logs } = await ask();
  await bare204(res);
  assert.strictEqual(sent.length, 1);
  const [{ url, init }] = sent;
  assert.strictEqual(url, COLLECT);
  assert.strictEqual(init.method, "POST");
  assert.deepStrictEqual(init.headers, { "Content-Type": "text/plain", "X-Radar-Site-Key": KEY, "X-Radar-Client-IP": IP, "X-Radar-Client-UA": UA },
    "exactly these headers: no cookie, no Origin, nothing else of the visitor's");
  assert.strictEqual(init.body, BUILT);
  assert.strictEqual(init.redirect, "manual", "a collector redirect is never followed");
  assert.strictEqual(waits.length, 1, "the forward runs in waitUntil");
  assert.deepStrictEqual(logs, [], "a 202 logs nothing");
});

test("the browser does not wait for the collector: the 204 comes back before the forward finishes", async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const { handle } = await import("../edge.js");
  const realFetch = globalThis.fetch;
  let finished = false;
  globalThis.fetch = async () => { await gate; finished = true; return new Response(null, { status: 202 }); };
  try {
    const waits = [];
    const request = new Request(SITE + "/api/radar", { method: "POST", body: BODY, headers: { Origin: SITE } });
    const res = await handle({ request, env: { RADAR_SITE_KEY: KEY }, waitUntil: (p) => waits.push(p) }, DATA);
    assert.strictEqual(res.status, 204);
    assert.strictEqual(finished, false);
    release();
    await Promise.all(waits);
    assert.strictEqual(finished, true);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("the visitor gets 204 whatever the collector says, and only its status is logged: never the key, the IP or the UA", async () => {
  for (const answer of [() => new Response("bad key " + KEY, { status: 401 }), () => new Response(null, { status: 404 }),
    () => new Response("boom", { status: 500 }), () => { throw new Error("network down " + KEY); }]) {
    const { res, sent, logs } = await ask({ answer });
    await bare204(res);
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(logs.length, 1);
    for (const secret of [KEY, IP, UA]) assert.ok(!logs[0].includes(secret), logs[0]);
  }
});

test("a body over 4096 bytes is refused with 413 and nothing is sent; exactly 4096 goes through", async () => {
  const over = await ask({ body: "x".repeat(4097) });
  assert.strictEqual(over.res.status, 413);
  assert.strictEqual(over.sent.length, 0);
  assert.strictEqual(over.res.headers.get("Set-Cookie"), null);
  const padded = (n) => { const base = JSON.stringify({ url: SITE + "/a", referrer: "" , pad: "" }); return JSON.stringify({ url: SITE + "/a", referrer: "", pad: "p".repeat(n - base.length) }); };
  assert.strictEqual(Buffer.byteLength(padded(4096)), 4096);
  const at = await ask({ body: padded(4096) });
  await bare204(at.res);
  assert.strictEqual(at.sent[0].init.body, JSON.stringify({ url: SITE + "/a", referrer: "" }));
  assert.strictEqual((await ask({ body: padded(4097) })).res.status, 413);
  // A body that lies about its length (or has none) is still counted as it streams.
  const stream = new ReadableStream({ start(c) { for (let i = 0; i < 5; i++) c.enqueue(new Uint8Array(1000)); c.close(); } });
  const { handle } = await import("../edge.js");
  const request = new Request(SITE + "/api/radar", { method: "POST", body: stream, duplex: "half", headers: { Origin: SITE } });
  const res = await handle({ request, env: { RADAR_SITE_KEY: KEY }, waitUntil: () => assert.fail("nothing is sent") }, DATA);
  assert.strictEqual(res.status, 413);
});

test("with the key unset (or empty) the visitor still gets 204 and nothing is sent", async () => {
  for (const env of [{}, { RADAR_SITE_KEY: "" }, null, { OTHER: KEY }]) {
    const { res, sent, waits } = await ask({ env });
    await bare204(res);
    assert.strictEqual(sent.length, 0, JSON.stringify(env));
    assert.strictEqual(waits.length, 0);
  }
});

test("the key is read from the env var key_var names", async () => {
  const data = { config: { ...DATA.config, key_var: "MY_RADAR" } };
  const { sent } = await ask({ data, env: { MY_RADAR: "other_key", RADAR_SITE_KEY: KEY } });
  assert.strictEqual(sent[0].init.headers["X-Radar-Site-Key"], "other_key");
});

test("a missing IP or User-Agent header is left out, not sent empty", async () => {
  const { handle } = await import("../edge.js");
  const realFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url, init) => { sent.push(init); return new Response(null, { status: 202 }); };
  try {
    const waits = [];
    const request = new Request(SITE + "/api/radar", { method: "POST", body: BODY, headers: { Origin: SITE } });
    request.headers.delete("User-Agent");
    await handle({ request, env: { RADAR_SITE_KEY: KEY }, waitUntil: (p) => waits.push(p) }, DATA);
    await Promise.all(waits);
    assert.deepStrictEqual(Object.keys(sent[0].headers).sort(), ["Content-Type", "X-Radar-Site-Key"]);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("any other path is none of Radar's business: null, nothing sent", async () => {
  for (const path of ["/", "/api/radar/", "/api/radarx", "/api/talk", "/API/RADAR", "/recipes/api/radar"]) {
    const { res, sent } = await ask({ path });
    assert.strictEqual(res, null, path);
    assert.strictEqual(sent.length, 0, path);
  }
});

test("only POST: GET, PUT, DELETE and OPTIONS get 405 with Allow: POST, and nothing is sent", async () => {
  for (const method of ["GET", "PUT", "DELETE", "OPTIONS", "PATCH"]) {
    const { res, sent } = await ask({ method });
    assert.strictEqual(res.status, 405, method);
    assert.strictEqual(res.headers.get("Allow"), "POST");
    assert.strictEqual(res.headers.get("Set-Cookie"), null);
    assert.strictEqual(sent.length, 0);
  }
});

test("only same-origin: another Origin gets 403; Origin null or absent counts only with Sec-Fetch-Site: same-origin", async () => {
  for (const headers of [{ Origin: "https://evil.example" }, { Origin: "http://smores.example" }, { Origin: "null" },
    { Origin: "null", "Sec-Fetch-Site": "cross-site" }, { Origin: "https://evil.example", "Sec-Fetch-Site": "same-origin" }]) {
    const { res, sent } = await ask({ headers });
    assert.strictEqual(res.status, 403, JSON.stringify(headers));
    assert.strictEqual(sent.length, 0);
  }
  const ok = await ask({ headers: { Origin: "null", "Sec-Fetch-Site": "same-origin" } });
  await bare204(ok.res);
  assert.strictEqual(ok.sent.length, 1);
});

test("an empty body sends nothing; the forward still runs without waitUntil", async () => {
  const empty = await ask({ body: "" });
  await bare204(empty.res);
  assert.strictEqual(empty.sent.length, 0);
  const plain = await ask({ waitUntil: false });
  await bare204(plain.res);
  assert.strictEqual(plain.sent.length, 1);
});

test("the edge forwards only a body it built: a forged POST's query, fragment, referrer path and extra fields are dropped", async () => {
  const body = JSON.stringify({ url: SITE + "/join?email=a@b.c#x", referrer: "https://ref.example/p?token=t", extra: "x" });
  const { res, sent } = await ask({ body });
  await bare204(res);
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].init.body, JSON.stringify({ url: SITE + "/join", referrer: "https://ref.example" }));
});

test("a page address on another origin, or a body that is not a JSON object with a url, is dropped: 204 and nothing sent", async () => {
  for (const body of [JSON.stringify({ url: "https://evil.example/join", referrer: "" }), JSON.stringify({ url: "http://smores.example/a" }),
    JSON.stringify({ url: "https://smores.example.evil.example/a" }), JSON.stringify({ url: "not a url" }), JSON.stringify({ path: "/a" }),
    JSON.stringify({ url: 1 }), JSON.stringify([SITE + "/a"]), JSON.stringify(SITE + "/a"), "null", "not json", "", "{\"url\":"]) {
    const { res, sent } = await ask({ body });
    await bare204(res);
    assert.strictEqual(sent.length, 0, body);
  }
});

test("an unreadable referrer goes as an empty string, the page view still counts", async () => {
  for (const referrer of [undefined, "", "not a url", "about:blank", 42]) {
    const { sent } = await ask({ body: JSON.stringify({ url: SITE + "/a", referrer }) });
    assert.strictEqual(sent[0].init.body, JSON.stringify({ url: SITE + "/a", referrer: "" }), String(referrer));
  }
});

test("Sec-GPC: 1 or DNT: 1 on the request: 204 and nothing is sent", async () => {
  for (const headers of [{ "Sec-GPC": "1" }, { DNT: "1" }, { "Sec-GPC": "1", DNT: "1" }]) {
    const { res, sent, waits } = await ask({ headers });
    await bare204(res);
    assert.strictEqual(sent.length, 0, JSON.stringify(headers));
    assert.strictEqual(waits.length, 0);
  }
  for (const headers of [{ "Sec-GPC": "0" }, { DNT: "0" }]) assert.strictEqual((await ask({ headers })).sent.length, 1, JSON.stringify(headers));
});

test("DNT: yes (older Firefox), and DNT or Sec-GPC in any case or with spaces, also send nothing (0.1.2)", async () => {
  for (const headers of [{ DNT: "yes" }, { DNT: "YES" }, { DNT: " 1 " }, { "Sec-GPC": " 1" }]) {
    const { res, sent } = await ask({ headers });
    await bare204(res);
    assert.strictEqual(sent.length, 0, JSON.stringify(headers));
  }
  for (const headers of [{ DNT: "no" }, { DNT: "null" }, { DNT: "" }]) assert.strictEqual((await ask({ headers })).sent.length, 1, JSON.stringify(headers));
});

test("a whitespace-only key counts as unset: no forward and no tag; a key with stray spaces is sent trimmed (0.1.2)", async () => {
  for (const key of [" ", "   ", "\t\n"]) {
    const { res, sent } = await ask({ env: { RADAR_SITE_KEY: key } });
    await bare204(res);
    assert.strictEqual(sent.length, 0, JSON.stringify(key));
    const { res: pageRes, nexts } = await page({ env: { RADAR_SITE_KEY: key } });
    assert.strictEqual(pageRes, null, `${JSON.stringify(key)}: the page is served as built`);
    assert.strictEqual(nexts.length, 0);
  }
  const { sent } = await ask({ env: { RADAR_SITE_KEY: ` ${KEY}\n` } });
  assert.strictEqual(sent[0].init.headers["X-Radar-Site-Key"], KEY);
});

test("the User-Agent goes on capped at the collector's 512 characters (0.1.2)", async () => {
  const { MAX_UA } = await import("../edge.js");
  assert.strictEqual(MAX_UA, 512);
  const long = "Mozilla/5.0 " + "x".repeat(2000);
  const { sent } = await ask({ headers: { "User-Agent": long } });
  assert.strictEqual(sent[0].init.headers["X-Radar-Client-UA"], long.slice(0, 512));
  const short = await ask();
  assert.strictEqual(short.sent[0].init.headers["X-Radar-Client-UA"], UA, "a normal one goes as it came");
});

test("a body stream that errors answers 204 and sends nothing, never a throw (0.1.2)", async () => {
  const { handle } = await import("../edge.js");
  const realFetch = globalThis.fetch;
  const sent = [];
  globalThis.fetch = async (url) => { sent.push(String(url)); return new Response(null, { status: 202 }); };
  try {
    for (const when of ["first", "later"]) {
      let n = 0;
      const body = new ReadableStream({ pull(c) {
        if (when === "later" && n++ === 0) { c.enqueue(new TextEncoder().encode('{"url":')); return; }
        c.error(new Error("connection reset"));
      } });
      const request = new Request(SITE + "/api/radar", { method: "POST", body, duplex: "half", headers: { Origin: SITE, "Content-Type": "text/plain" } });
      const res = await handle({ request, env: { RADAR_SITE_KEY: KEY }, waitUntil: () => {} }, DATA);
      await bare204(res);
    }
    // A body someone already read is the same: 204, nothing sent.
    const used = new Request(SITE + "/api/radar", { method: "POST", body: BODY, headers: { Origin: SITE } });
    await used.text();
    await bare204(await handle({ request: used, env: { RADAR_SITE_KEY: KEY }, waitUntil: () => {} }, DATA));
    assert.strictEqual(sent.length, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("nothing in the request picks where the page view goes: always exactly collect_url, never following a redirect", async () => {
  const body = JSON.stringify({ url: SITE + "/a", referrer: "", target: "https://evil.example/steal", collect_url: "https://evil.example/c" });
  for (const headers of [{ "X-Forwarded-Host": "evil.example" }, { Host: "evil.example" }, { "X-Original-URL": "https://evil.example/" }, {}]) {
    const { sent } = await ask({ headers, body });
    assert.strictEqual(sent.length, 1, JSON.stringify(headers));
    assert.strictEqual(sent[0].url, COLLECT, JSON.stringify(headers));
    assert.strictEqual(sent[0].init.redirect, "manual");
    assert.strictEqual(sent[0].init.body, JSON.stringify({ url: SITE + "/a", referrer: "" }));
  }
});

// 0.1.1: the edge, not the build, puts the script on the page, and only once the site key secret exists (a Pages secret is
// visible only at runtime, never at build time). A fake HTMLRewriter that does what the real one does with the handlers radar
// registers, in the order a streaming rewrite meets them: an element's start tag, then the elements inside it, then its end tag.
const TAG = '<script defer src="/assets/plugins/radar/assets/radar.js"></script>';
function fakeRewriter() {
  const made = { count: 0 };
  const make = () => {
    made.count += 1;
    const handlers = [];
    const rw = {
      on(selector, handler) { handlers.push({ selector, handler }); return rw; },
      onDocument() { throw new Error("radar uses element handlers only"); },
      transform(res) {
        return new Response(res.body.pipeThrough(new TransformStream({
          buf: "",
          transform(chunk, c) { this.buf = (this.buf || "") + new TextDecoder().decode(chunk); },
          flush(c) {
            let text = this.buf || "";
            const ends = [];
            for (const { selector, handler } of handlers) {
              const m = /^script\[src="([^"]+)"\]$/.exec(selector);
              if (m) {
                if (text.includes(`src="${m[1]}"`)) handler.element({});
              } else if (selector === "body") {
                if (text.includes("<body")) handler.element({ onEndTag: (fn) => ends.push(fn) });
              } else throw new Error("unexpected selector " + selector);
            }
            for (const fn of ends) {
              const at = text.lastIndexOf("</body>");
              if (at < 0) continue;
              fn({ before: (html, opts) => { assert.deepStrictEqual(opts, { html: true }); text = text.slice(0, at) + html + text.slice(at); } });
            }
            c.enqueue(new TextEncoder().encode(text));
          },
        })), { status: res.status, statusText: res.statusText, headers: res.headers });
      },
    };
    return rw;
  };
  return { make, made };
}

const PAGE = "<!doctype html><html><head><title>S'mores</title></head><body><main>Hi</main></body></html>";
const pageAnswer = (body = PAGE, { status = 200, type = "text/html; charset=utf-8", extra = {} } = {}) =>
  new Response(body, { status, headers: { "content-type": type, "content-length": String(Buffer.byteLength(body)), "cache-control": "public, max-age=0, must-revalidate", etag: '"abc"', "x-site": "smores", ...extra } });

// A page request through radar's handle, with a recording next() and fetch.
async function page({ path = "/recipes/", method = "GET", env = { RADAR_SITE_KEY: KEY }, data = DATA, answer = () => pageAnswer(), headers = {}, nextSpy = {} } = {}) {
  const { handle } = await import("../edge.js");
  const f = fakeRewriter();
  const nexts = [];
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { sent.push(String(url)); return new Response(null, { status: 202 }); };
  try {
    const request = new Request(SITE + path, { method, headers, body: method === "POST" ? BODY : undefined });
    const waits = [];
    const res = await handle({ request, env, next: async (r) => { nexts.push(r); nextSpy.last = r; return answer(); }, waitUntil: (p) => waits.push(p) }, data, f.make);
    await Promise.all(waits);
    if (path !== "/api/radar") assert.strictEqual(waits.length, 0, "a page request waits on nothing");
    return { res, nexts, sent, made: f.made };
  } finally {
    globalThis.fetch = realFetch;
  }
}

const tagsIn = (html) => html.split(TAG).length - 1;

// The plugin chain (runEdge) lives at theme/chain.js in site-kit and at functions/_chain.js (written by the build) in a site that
// vendors this plugin; the chain tests use whichever is there, and are skipped, never failed, when neither is.
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const CHAIN = ["../../../theme/chain.js", "../../../functions/_chain.js"]
  .map((rel) => path.resolve(__dirname, rel))
  .find((p) => fs.existsSync(p));
const chainTest = CHAIN ? {} : { skip: "no plugin chain here: neither theme/chain.js (site-kit) nor functions/_chain.js (a built site)" };
const loadChain = () => import(pathToFileURL(CHAIN).href);

test("no key set (missing, empty, null env, or another var): a page is null, untouched, next() never called, nothing sent", async () => {
  for (const env of [{}, { RADAR_SITE_KEY: "" }, null, { OTHER: KEY }]) {
    for (const path of ["/", "/recipes/", "/about.html", "/assets/site.css"]) {
      const { res, nexts, sent, made } = await page({ env, path });
      assert.strictEqual(res, null, `${JSON.stringify(env)} ${path}`);
      assert.strictEqual(nexts.length, 0, "the page is not even fetched");
      assert.strictEqual(sent.length, 0);
      assert.strictEqual(made.count, 0, "no rewriter is made");
    }
  }
  // The key under another name than key_var names does not turn Radar on either.
  const other = await page({ data: { config: { ...DATA.config, key_var: "MY_RADAR" } } });
  assert.strictEqual(other.res, null);
});

test("no key set, through the chain: the served page is byte-for-byte the page as built", chainTest, async () => {
  const { handle } = await import("../edge.js");
  const { runEdge } = await loadChain();
  const built = pageAnswer();
  const bytes = Buffer.from(await built.clone().arrayBuffer());
  const served = (await runEdge({ request: new Request(SITE + "/"), env: {}, next: async () => built }, [{ name: "radar", handle, data: DATA }], fakeRewriter().make)) ?? built;
  assert.strictEqual(served, built, "the very same response");
  assert.deepStrictEqual(Buffer.from(await served.arrayBuffer()), bytes);
});

test("with the key set, an HTML 200 page gets exactly one script tag, just before </body>, status and headers kept", async () => {
  const { res, nexts, sent } = await page();
  assert.strictEqual(nexts.length, 1);
  assert.strictEqual(sent.length, 0, "a page view is radar.js's job, not the page request's");
  assert.strictEqual(res.status, 200);
  const html = await res.text();
  assert.strictEqual(html, PAGE.replace("</body>", TAG + "</body>"));
  assert.strictEqual(tagsIn(html), 1);
  assert.strictEqual(res.headers.get("content-type"), "text/html; charset=utf-8");
  assert.strictEqual(res.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  assert.strictEqual(res.headers.get("x-site"), "smores");
  assert.strictEqual(res.headers.get("content-length"), null, "the rewrite changes the length, so the old one goes");
  for (const [, v] of res.headers) assert.ok(!v.includes(KEY), "never the key in a header");
  assert.ok(!html.includes(KEY), "never the key in the page");
});

test("the key read is the one key_var names", async () => {
  const data = { config: { ...DATA.config, key_var: "MY_RADAR" } };
  const { res } = await page({ data, env: { MY_RADAR: "k2" } });
  assert.strictEqual(tagsIn(await res.text()), 1);
});

test("a page that already holds the tag does not get a second one", async () => {
  for (const body of [PAGE.replace("</body>", TAG + "</body>"), PAGE.replace("</head>", TAG + "</head>")]) {
    const { res } = await page({ answer: () => pageAnswer(body) });
    assert.strictEqual(await res.text(), body);
  }
});

test("with the key set, a non-HTML response or a non-200 HTML page comes back unchanged", async () => {
  for (const [body, opts] of [["\x89PNG", { type: "image/png" }], ['{"a":1}', { type: "application/json" }], ["a{}", { type: "text/css" }],
    ["x()", { type: "application/javascript" }], ["x()", { type: "text/javascript; charset=utf-8" }],
    [PAGE, { type: "text/plain" }], [PAGE, { status: 404 }], [PAGE, { status: 500 }], [PAGE, { type: "" }]]) {
    const built = pageAnswer(body, opts);
    const { res, made } = await page({ answer: () => built });
    assert.strictEqual(res, built, JSON.stringify(opts));
    assert.strictEqual(made.count, 0, JSON.stringify(opts));
    assert.strictEqual(await res.text(), body);
  }
  // The radar.js asset itself is never touched.
  const js = pageAnswer("navigator.sendBeacon('/api/radar', '</body>');", { type: "application/javascript" });
  const asset = await page({ path: "/assets/plugins/radar/assets/radar.js", answer: () => js });
  assert.strictEqual(asset.res, js);
  assert.strictEqual(tagsIn(await asset.res.text()), 0);
  const redirect = new Response(null, { status: 301, headers: { location: "/recipes/" } });
  assert.strictEqual((await page({ answer: () => redirect })).res, redirect);
});

test("with the key set, HEAD and other non-GET page requests are untouched: null, next() never called", async () => {
  for (const method of ["HEAD", "POST", "PUT", "OPTIONS"]) {
    const { res, nexts, sent } = await page({ method, path: "/recipes/" });
    assert.strictEqual(res, null, method);
    assert.strictEqual(nexts.length, 0, method);
    assert.strictEqual(sent.length, 0, method);
  }
});

test("POST /api/radar is still answered by the beacon path, not the page path", async () => {
  const { res, nexts, made, sent } = await page({ method: "POST", path: "/api/radar", headers: { Origin: SITE } });
  assert.strictEqual(res.status, 204);
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(nexts.length, 0);
  assert.strictEqual(made.count, 0);
  for (const h of [{ "Sec-GPC": "1" }, { DNT: "1" }]) {
    const opted = await page({ method: "POST", path: "/api/radar", headers: { Origin: SITE, ...h } });
    assert.strictEqual(opted.res.status, 204);
    assert.strictEqual(opted.sent.length, 0, "GPC and DNT still send nothing with the injection on");
  }
});

test("with the key, an asset GET keeps If-None-Match / If-Modified-Since and its 304 (0.1.2: only a page path is asked unconditionally)", async () => {
  const cond = { "If-None-Match": '"abc"', "If-Modified-Since": "Mon, 01 Jan 2024 00:00:00 GMT" };
  for (const path of ["/assets/site.css", "/assets/plugins/radar/assets/radar.js", "/images/door.webp", "/favicon.ico", "/sitemap.xml"]) {
    const notModified = new Response(null, { status: 304, headers: { etag: '"abc"' } });
    const { res, nexts } = await page({ path, headers: cond, answer: () => notModified });
    assert.strictEqual(nexts.length, 1, path);
    assert.strictEqual(nexts[0].headers.get("if-none-match"), '"abc"', path);
    assert.strictEqual(nexts[0].headers.get("if-modified-since"), cond["If-Modified-Since"], path);
    assert.strictEqual(res, notModified, `${path}: the 304 comes back as it came`);
  }
});

test("with the key, every page path is still asked unconditionally: a trailing slash, .html, and an extensionless path", async () => {
  const cond = { "If-None-Match": '"abc"', "If-Modified-Since": "Mon, 01 Jan 2024 00:00:00 GMT" };
  for (const path of ["/", "/recipes/", "/alfajores.html", "/about", "/places/summerlin"]) {
    const { res, nexts } = await page({ path, headers: cond });
    assert.strictEqual(nexts[0].headers.get("if-none-match"), null, path);
    assert.strictEqual(nexts[0].headers.get("if-modified-since"), null, path);
    assert.strictEqual(tagsIn(await res.text()), 1, path);
  }
});

test("with the key, a page at a dotted path is still asked unconditionally when the browser asks for a page (Codex, 0.1.2)", async () => {
  const cond = { "If-None-Match": '"abc"', "If-Modified-Since": "Mon, 01 Jan 2024 00:00:00 GMT" };
  const navigations = [
    { Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "Sec-Fetch-Dest": "document" },
    { Accept: "TEXT/HTML" },
    { "Sec-Fetch-Dest": "document" },
    { "Sec-Fetch-Dest": "iframe" },
  ];
  for (const extra of navigations) {
    const { res, nexts } = await page({ path: "/releases/v1.2", headers: { ...cond, ...extra } });
    assert.strictEqual(nexts[0].headers.get("if-none-match"), null, JSON.stringify(extra));
    assert.strictEqual(nexts[0].headers.get("if-modified-since"), null, JSON.stringify(extra));
    assert.strictEqual(tagsIn(await res.text()), 1, JSON.stringify(extra));
  }
  // The same dotted path loaded as an asset keeps its validators.
  for (const extra of [{ Accept: "image/avif,image/webp,*/*;q=0.8", "Sec-Fetch-Dest": "image" }, { Accept: "text/css,*/*;q=0.1", "Sec-Fetch-Dest": "style" }, { Accept: "*/*", "Sec-Fetch-Dest": "script" }]) {
    const notModified = new Response(null, { status: 304 });
    const { res, nexts } = await page({ path: "/releases/v1.2", headers: { ...cond, ...extra }, answer: () => notModified });
    assert.strictEqual(nexts[0].headers.get("if-none-match"), '"abc"', JSON.stringify(extra));
    assert.strictEqual(res, notModified);
  }
});

test("isPage: page paths, never an asset", async () => {
  const { isPage } = await import("../edge.js");
  for (const p of ["/", "/recipes/", "/a.html", "/about", "/places/summer.lin/x"]) assert.strictEqual(isPage(p), true, p);
  for (const p of ["/a.css", "/assets/plugins/radar/assets/radar.js", "/i/door.webp", "/favicon.ico", "/robots.txt", "/feed.xml"]) assert.strictEqual(isPage(p), false, p);
});

test("with the key, the injected page drops ETag and Last-Modified (they describe the page as built); without it they stay", chainTest, async () => {
  const validators = { etag: '"abc"', "last-modified": "Mon, 01 Jan 2024 00:00:00 GMT" };
  const keyed = await page({ answer: () => pageAnswer(PAGE, { extra: validators }) });
  assert.strictEqual(tagsIn(await keyed.res.text()), 1);
  assert.strictEqual(keyed.res.headers.get("etag"), null);
  assert.strictEqual(keyed.res.headers.get("last-modified"), null);
  assert.strictEqual(keyed.res.headers.get("cache-control"), "public, max-age=0, must-revalidate", "cache-control is left as built");
  const { handle } = await import("../edge.js");
  const { runEdge } = await loadChain();
  const built = pageAnswer(PAGE, { extra: validators });
  const served = (await runEdge({ request: new Request(SITE + "/"), env: {}, next: async () => built }, [{ name: "radar", handle, data: DATA }], fakeRewriter().make)) ?? built;
  assert.strictEqual(served.headers.get("etag"), '"abc"');
  assert.strictEqual(served.headers.get("last-modified"), validators["last-modified"]);
  // A non-HTML response with the key keeps its validators too: it is the identical response.
  const png = pageAnswer("\x89PNG", { type: "image/png", extra: validators });
  const img = await page({ answer: () => png });
  assert.strictEqual(img.res, png);
  assert.strictEqual(img.res.headers.get("etag"), '"abc"');
});

test("with the key, a conditional GET reaches next() without If-None-Match / If-Modified-Since, so the page comes back 200 with the tag", async () => {
  const cond = { "If-None-Match": '"abc"', "If-Modified-Since": "Mon, 01 Jan 2024 00:00:00 GMT", Accept: "text/html" };
  // next() plays the origin: a 304 when the request still carries a validator, the full page otherwise.
  const origin = { last: null };
  const { res, nexts } = await page({ headers: cond, answer: () => (origin.last.headers.has("if-none-match") || origin.last.headers.has("if-modified-since")
    ? new Response(null, { status: 304, headers: { etag: '"abc"' } }) : pageAnswer()), nextSpy: origin });
  assert.strictEqual(nexts.length, 1);
  assert.strictEqual(nexts[0].headers.get("if-none-match"), null);
  assert.strictEqual(nexts[0].headers.get("if-modified-since"), null);
  assert.strictEqual(nexts[0].headers.get("accept"), "text/html", "every other header goes through");
  assert.strictEqual(nexts[0].url, SITE + "/recipes/");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(tagsIn(await res.text()), 1);
  assert.strictEqual(res.headers.get("etag"), null);
  // Without the key nothing is touched: null, and next() is never called with or without the validators.
  const off = await page({ headers: cond, env: {} });
  assert.strictEqual(off.res, null);
  assert.strictEqual(off.nexts.length, 0);
});

// 0.2 (site-kit#426): the ingest path. A known AI crawler, or a page visit referred by a known AI host from a browser that has
// not opted out, sends the Radar service one event the edge builds itself: kind, bot or source, path, ts, and no other field.
const INGEST = "https://radar.example/v1/ingest";
const INGEST_KEY = "ri_secret_ingest_key_456";
const IDATA = { config: { key_var: "RADAR_SITE_KEY", ingest_key_var: "RADAR_INGEST_KEY", ingest_url: INGEST } };
const GPTBOT = "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)";
const NOW = 1763000000123;
// What Cloudflare Pages sends with an HTML page.
const PAGES_CC = "public, max-age=0, must-revalidate";

async function visit({ path = "/pricing", ua = UA, headers = {}, env = { RADAR_INGEST_KEY: INGEST_KEY }, data = IDATA, rewriter,
  served = () => new Response("<html><body>page</body></html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": PAGES_CC } }) } = {}) {
  const { handle } = await import("../edge.js");
  const sent = [];
  const waits = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push({ url: String(url), init }); return new Response(null, { status: 202 }); };
  try {
    const request = new Request(SITE + path, { headers: { "User-Agent": ua, "CF-Connecting-IP": IP, Cookie: "session=abc", ...headers } });
    const built = served();
    const res = await handle({ request, env, next: async () => built, waitUntil: (p) => waits.push(p) }, data, rewriter, () => NOW);
    await Promise.all(waits);
    return { res, built, sent, events: sent.map((s) => JSON.parse(s.init.body)).flat() };
  } finally {
    globalThis.fetch = realFetch;
  }
}

test("a known AI crawler sends one event with exactly kind, bot, path and ts, by Bearer key to ingest_url, and the page is served as it came", async () => {
  const { res, built, sent, events } = await visit({ path: "/pricing?utm=x&email=a%40b.c", ua: GPTBOT });
  assert.strictEqual(res, built, "the page is the site's own response, untouched");
  assert.strictEqual(sent.length, 1);
  assert.strictEqual(sent[0].url, INGEST);
  assert.deepStrictEqual(sent[0].init.headers, { "Content-Type": "application/json", Authorization: `Bearer ${INGEST_KEY}` });
  assert.strictEqual(sent[0].init.redirect, "manual");
  assert.deepStrictEqual(events, [{ kind: "crawler", bot: "gptbot", path: "/pricing", ts: 1763000000 }]);
});

test("no event ever carries a field outside the allow-list: no IP, user agent, cookie, query string or visitor id (the lead's condition)", async () => {
  const { ALLOWED } = await import("../edge.js");
  assert.deepStrictEqual(ALLOWED, { crawler: ["kind", "bot", "path", "ts"], ai_referral: ["kind", "source", "path", "ts"],
    campaign: ["kind", "source", "medium", "campaign", "path", "ts"] });
  const all = [
    ...(await visit({ ua: GPTBOT })).sent, ...(await visit({ headers: { Referer: "https://chatgpt.com/c/abc?x=1", Accept: "text/html" } })).sent,
    ...(await visit({ path: "/guide/?utm_source=news&utm_term=shoes&email=a%40b.c", headers: { Accept: "text/html" } })).sent,
  ];
  assert.strictEqual(all.length, 3);
  assert.deepStrictEqual(all.map(({ init }) => JSON.parse(init.body)[0].kind), ["crawler", "ai_referral", "campaign"]);
  for (const { init } of all) {
    for (const ev of JSON.parse(init.body)) assert.deepStrictEqual(Object.keys(ev), ALLOWED[ev.kind], JSON.stringify(ev));
    for (const leak of [IP, "session=abc", "GPTBot/1.2", "Mozilla", "abc?x=1", "utm", "shoes", "a@b", "a%40b"]) assert.ok(!init.body.includes(leak), leak);
  }
});

test("a page visit referred by a known AI host counts under its source; an unknown referrer, a non-page, GPC or DNT sends nothing", async () => {
  const ref = (Referer, extra = {}, path = "/guide/") => visit({ path, headers: { Referer, Accept: "text/html", ...extra } });
  assert.deepStrictEqual((await ref("https://chat.openai.com/share/1")).events, [{ kind: "ai_referral", source: "chatgpt.com", path: "/guide/", ts: 1763000000 }]);
  assert.deepStrictEqual((await ref("https://www.perplexity.ai/search?q=x")).events[0].source, "perplexity.ai");
  for (const [label, r] of [["google", await ref("https://www.google.com/")], ["lookalike", await ref("https://chatgpt.com.evil.example/")], ["suffix lookalike", await ref("https://notchatgpt.com/")],
    ["no referrer", await visit({ headers: { Accept: "text/html" } })], ["GPC", await ref("https://claude.ai/", { "Sec-GPC": "1" })],
    ["DNT", await ref("https://claude.ai/", { DNT: "yes" })], ["an image", await visit({ path: "/img/a.png", headers: { Referer: "https://claude.ai/", Accept: "image/*" } })]]) {
    assert.strictEqual(r.sent.length, 0, label);
  }
  // A crawler is not a person: DNT and GPC are a person's request, so a crawler still counts.
  assert.strictEqual((await visit({ ua: GPTBOT, headers: { DNT: "1", "Sec-GPC": "1" } })).sent.length, 1);
});

test("the path is sent only when the site served a page there; anything else is (other)", async () => {
  const notFound = () => new Response("nope", { status: 404, headers: { "content-type": "text/html" } });
  const json = () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  const unchanged = () => new Response(null, { status: 304, headers: { "cache-control": PAGES_CC } });
  assert.strictEqual((await visit({ ua: GPTBOT, path: "/wp-login.php?user=ann", served: notFound })).events[0].path, "(other)");
  assert.strictEqual((await visit({ ua: GPTBOT, path: "/api/thing", served: json })).events[0].path, "(other)");
  assert.strictEqual((await visit({ ua: GPTBOT, path: "/about", served: unchanged })).events[0].path, "/about");
  assert.strictEqual((await visit({ ua: GPTBOT, path: "/a.css", served: unchanged })).events[0].path, "(other)");
  // A page for one person (the members gate serves it private, no-store; mi-dev-4 on radar#49) is never sent by its path.
  for (const cc of ["private, no-store", "no-store", "private", "max-age=0, private", "PRIVATE"]) {
    const mine = () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html", "cache-control": cc } });
    assert.strictEqual((await visit({ ua: GPTBOT, path: "/members/jane-doe/", served: mine })).events[0].path, "(other)", cc);
  }
  const shared = () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html", "cache-control": "public, max-age=600" } });
  assert.strictEqual((await visit({ ua: GPTBOT, path: "/guide/", served: shared })).events[0].path, "/guide/");
  const notPrivate = () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html", "cache-control": "public, s-maxage=60, privateish" } });
  assert.strictEqual((await visit({ ua: GPTBOT, path: "/guide/", served: notPrivate })).events[0].path, "/guide/", "a word that only starts with private");
  // Fails closed: no header, an empty one, one that never says public, a malformed one, or ; as the separator (mi-dev-3 and
  // maint-review-2 on #427).
  for (const cc of [null, "", "max-age=600", "s-maxage=60", "no-cache", "%%%,,", "publicity", "x-public", "public;private", "max-age=0;no-store, public", "no-store;", "public, no-store;",
    'public, private="set-cookie"', '"public"', "public=1;no-store", "public, PRIVATE", "public, No-Store"]) {
    const headers = { "content-type": "text/html", ...(cc === null ? {} : { "cache-control": cc }) };
    assert.strictEqual((await visit({ ua: GPTBOT, path: "/members/jane/", served: () => new Response("<html></html>", { status: 200, headers }) })).events[0].path,
      "(other)", String(cc));
  }
  for (const cc of ["Public", "public,max-age=60", " public ", "max-age=0, public"]) {
    const headers = { "content-type": "text/html", "cache-control": cc };
    assert.strictEqual((await visit({ ua: GPTBOT, path: "/guide/", served: () => new Response("<html></html>", { status: 200, headers }) })).events[0].path, "/guide/", cc);
  }
});

test("no ingest key or no ingest_url sends nothing and leaves the request to the next plugin; an ingest failure never touches the page", async () => {
  for (const [label, opts] of [["no key", { env: {} }], ["blank key", { env: { RADAR_INGEST_KEY: "  " } }],
    ["no ingest_url", { data: { config: { ...IDATA.config, ingest_url: undefined } } }]]) {
    const r = await visit({ ua: GPTBOT, ...opts });
    assert.strictEqual(r.res, null, label);
    assert.strictEqual(r.sent.length, 0, label);
  }
  const { handle } = await import("../edge.js");
  const realFetch = globalThis.fetch, realLog = console.log, logs = [];
  globalThis.fetch = async () => { throw new Error("down"); };
  console.log = (...a) => logs.push(a.join(" "));
  try {
    const built = new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } });
    const waits = [];
    const res = await handle({ request: new Request(SITE + "/", { headers: { "User-Agent": GPTBOT } }), env: { RADAR_INGEST_KEY: INGEST_KEY },
      next: async () => built, waitUntil: (p) => waits.push(p) }, IDATA);
    await Promise.all(waits);
    assert.strictEqual(res, built);
    assert.deepStrictEqual(logs, ['{"plugin":"radar","ingest":"unreachable"}'], "only that it failed: never the key");
  } finally {
    globalThis.fetch = realFetch;
    console.log = realLog;
  }
});

test("with both paths set, a crawler on a page is counted and the page still gets radar.js from the collect path", async () => {
  const both = { config: { ...DATA.config, ...IDATA.config } };
  const f = fakeRewriter();
  const { sent, events } = await visit({ ua: GPTBOT, data: both, env: { RADAR_INGEST_KEY: INGEST_KEY, RADAR_SITE_KEY: KEY }, rewriter: f.make });
  assert.deepStrictEqual(sent.map((s) => s.url), [INGEST], "the crawler goes to Radar's ingest only, never to Foo's collector");
  assert.strictEqual(events[0].path, "/pricing");
  assert.strictEqual(f.made.count, 1, "the page still went through the collect path's rewriter");
});

test("a slow ingest never holds the page: handle returns before the send settles (mi-dev-3 on #427)", async () => {
  const { handle } = await import("../edge.js");
  const realFetch = globalThis.fetch;
  let release;
  globalThis.fetch = () => new Promise((resolve) => { release = () => resolve(new Response(null, { status: 202 })); });
  try {
    const built = new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } });
    const waits = [];
    const res = await Promise.race([
      handle({ request: new Request(SITE + "/", { headers: { "User-Agent": GPTBOT } }), env: { RADAR_INGEST_KEY: INGEST_KEY },
        next: async () => built, waitUntil: (p) => waits.push(p) }, IDATA),
      new Promise((_, reject) => setTimeout(() => reject(new Error("handle waited for the ingest")), 200)),
    ]);
    assert.strictEqual(res, built);
    assert.strictEqual(waits.length, 1, "the send is handed to waitUntil");
    release();
    await Promise.all(waits);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("an ingest refusal logs only its status, never the key; Radar's 204 (or any 2xx) logs nothing (mi-dev-3 on #427, Fable on radar#50)", async () => {
  const { handle } = await import("../edge.js");
  const realFetch = globalThis.fetch, realLog = console.log;
  let status = 500, logs = [];
  globalThis.fetch = async () => new Response(status === 204 ? null : "x", { status });
  console.log = (...a) => logs.push(a.join(" "));
  try {
    for (const [code, want] of [[500, ['{"plugin":"radar","ingest":500}']], [401, ['{"plugin":"radar","ingest":401}']], [204, []], [202, []]]) {
      status = code; logs = [];
      const waits = [];
      await handle({ request: new Request(SITE + "/", { headers: { "User-Agent": GPTBOT } }), env: { RADAR_INGEST_KEY: INGEST_KEY },
        next: async () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }), waitUntil: (p) => waits.push(p) }, IDATA);
      await Promise.all(waits);
      assert.deepStrictEqual(logs, want, String(code));
    }
  } finally {
    globalThis.fetch = realFetch;
    console.log = realLog;
  }
});

test("a page path Radar's ingest would refuse goes as (other), so one page never drops the batch (0.2.2, mi-dev-4 on radar#53)", async () => {
  for (const path of ["/café", "/caf%C3%A9", "/a%00b", "/a%253fq", "/a%C0%AFb", "/a%", `/${"x".repeat(520)}`]) {
    const { events } = await visit({ path, ua: GPTBOT });
    assert.deepStrictEqual(events.map((e) => e.path), ["(other)"], path);
  }
  for (const path of ["/pricing", "/a%2Fb", "/~user/", "/guide/a-b_c.html"]) {
    const { events } = await visit({ path, ua: GPTBOT });
    assert.strictEqual(events.length, 1, path);
    assert.notStrictEqual(events[0].path, "(other)", path);
  }
  // The rule is radar's own, byte for byte: every escape of a byte its PATH takes passes, and no other.
  const { sendable } = await import("../edge.js");
  for (let b = 0; b < 256; b++) {
    const h = b.toString(16).padStart(2, "0"), takes = b !== 0x25 && /^[\x21\x22\x24-\x3e\x40-\x5b\x5d-\x7e]$/.test(String.fromCharCode(b));
    for (const hex of [h, h.toUpperCase()]) assert.strictEqual(sendable(`/a%${hex}`), takes, hex);
  }
});

// 0.3 (radar#51, site-kit#429): a page visit that a campaign link brought.
const campaignVisit = (query, headers = {}, path = "/guide/") => visit({ path: path + query, headers: { Accept: "text/html", ...headers } });

test("a campaign link sends one campaign event with only the cleaned utm_source, utm_medium and utm_campaign; nothing else from the URL (0.3)", async () => {
  const { sent, events } = await campaignVisit("?utm_source=Newsletter&utm_medium=Email&utm_campaign=Spring_Sale&utm_term=shoes&utm_content=hero&gclid=abc123&email=a%40b.c&fbclid=zz");
  assert.deepStrictEqual(events, [{ kind: "campaign", source: "newsletter", medium: "email", campaign: "spring_sale", path: "/guide/", ts: 1763000000 }]);
  for (const leak of ["shoes", "hero", "gclid", "abc123", "a@b", "a%40b", "fbclid", "zz", "utm_", IP, "session=abc", "Mozilla"]) assert.ok(!sent[0].init.body.includes(leak), leak);
  // A medium or campaign past the rule is dropped to '', and the visit still counts under its source.
  for (const [q, medium, campaign] of [["?utm_source=ads&utm_medium=E%20Mail", "", ""], ["?utm_source=ads&utm_campaign=" + "x".repeat(65), "", ""],
    ["?utm_source=ads&utm_campaign=a&utm_campaign=b", "", ""], ["?utm_source=ads&utm_medium=cpc", "cpc", ""], ["?utm_source=ads&utm_campaign=caf%C3%A9", "", ""],
    ["?utm_source=ads&utm_campaign=" + "x".repeat(64).replace(/x/g, "a1").slice(0, 64), "", "(person)"]]) {
    const ev = (await campaignVisit(q)).events[0];
    if (campaign === "(person)") { assert.strictEqual(ev.source, "(other)", q); continue; }
    assert.deepStrictEqual([ev.source, ev.medium, ev.campaign], ["ads", medium, campaign], q);
  }
});

test("no usable utm_source, a non-page, GPC or DNT sends no campaign; an AI referral or a crawler is counted as that, not as a campaign (0.3)", async () => {
  for (const q of ["", "?utm_medium=email", "?utm_source=", "?utm_source=a%40b.com", "?utm_source=" + "x".repeat(65), "?utm_source=a&utm_source=b", "?utm_source=caf%C3%A9", "?utm_source=a%20b"]) {
    assert.strictEqual((await campaignVisit(q)).sent.length, 0, q);
  }
  assert.strictEqual((await campaignVisit("?utm_source=news", { "Sec-GPC": "1" })).sent.length, 0, "GPC");
  assert.strictEqual((await campaignVisit("?utm_source=news", { DNT: "1" })).sent.length, 0, "DNT");
  assert.strictEqual((await visit({ path: "/img/a.png?utm_source=news", headers: { Accept: "image/*" } })).sent.length, 0, "an image");
  assert.deepStrictEqual((await campaignVisit("?utm_source=chatgpt.com", { Referer: "https://chatgpt.com/" })).events.map((e) => e.kind), ["ai_referral"]);
  assert.deepStrictEqual((await visit({ ua: GPTBOT, path: "/guide/?utm_source=news" })).events.map((e) => e.kind), ["crawler"]);
  // An unknown referrer does not stop a campaign from counting.
  assert.strictEqual((await campaignVisit("?utm_source=news", { Referer: "https://www.google.com/" })).events[0].kind, "campaign");
});

test("a person-shaped utm value never leaves the site: the visit goes as the (other) campaign (0.3, radar#55's rule)", async () => {
  for (const [name, v] of [["utm_campaign", "jane.doe"], ["utm_campaign", "jane.doe.gmail.com"], ["utm_source", "gmail"], ["utm_campaign", "deadbeefcafebabe"],
    ["utm_campaign", "555-123-4567"], ["utm_campaign", "15551234567"], ["utm_campaign", "order-1234567"], ["utm_campaign", "a1b2c3d4e5f6a7b8"],
    ["utm_campaign", "x".repeat(64)], ["utm_campaign", "id_abcdefghijklmnopqrstuvwx"], ["utm_campaign", "2025551234"], ["utm_campaign", "2025-55-1234"],
    ["utm_campaign", "2026-11-2026-12-55"], ["utm_source", "jane.doe.acme.com"]]) {
    const q = name === "utm_source" ? `?utm_source=${v}` : `?utm_source=news&${name}=${v}`;
    const { sent, events } = await campaignVisit(q);
    assert.deepStrictEqual(events, [{ kind: "campaign", source: "(other)", medium: "", campaign: "", path: "/guide/", ts: 1763000000 }], q);
    assert.ok(!sent[0].init.body.includes(v), `${q}: the value left the site`);
  }
  for (const v of ["radar-check", "spring_2026_v2", "black_friday", "newsletter", "jane_doe", "2026-11", "spring-2026-11", "2026-11-17", "20261117"]) {
    assert.strictEqual((await campaignVisit(`?utm_source=news&utm_campaign=${v}`)).events[0].campaign, v, v);
  }
  // A bare domain is where the link was posted, not who clicked it (site-dev's call on radar#55).
  for (const v of ["google.com", "t.co", "m.facebook.com", "news.ycombinator.com"]) assert.strictEqual((await campaignVisit(`?utm_source=${v}`)).events[0].source, v, v);
  // The rule is radar's, value for value: these are radar's own lists (workers/api/test/ingest.test.ts on radar#55).
  const { personal } = await import("../edge.js");
  for (const v of ["jane.doe", "jane.doe.gmail.com", "gmail", "555-123-4567", "15551234567", "order-1234567",
    "a1b2c3d4e5f6a7b8", "deadbeefcafebabe", "x".repeat(64), "id_abcdefghijklmnopqrstuvwx",
    "2025551234", "202-555-1234", "19995551234", "202611171234", "2026-11-2026-12-55", "2025-55-1234", "jane.doe.acme.com", "j.doe.example.org", "a.b.c.dev",
    "jane.doe.acme.com.", "jane..doe.com", "jane.doe.acme.nl", "jane.doe.me", "jane.doe.info", "jane.doe.xyz", "promo-jane.doe", "2026-11-17-jane.doe",
    "jane.doe2", "jane.doe.m.facebook.com", "spring_2026.v2", "x2026-11-17-123", "5555-12-12",
    "jane.doe.com"]) assert.strictEqual(personal(v), true, v);
  for (const v of ["radar-check", "spring_2026_v2", "black_friday", "newsletter", "email", "cpc", "social", "jane_doe", "2026-11",
    "google.com", "t.co", "m.facebook.com", "news.ycombinator.com", "spring-2026-11", "2026-11-17", "20261117", "sale-2026-11-17-v2", "deadbeef",
    "black-friday-2025-11-28", "q4_2026_12", "x-2026-11-17-123",
    "janedoe.com"]) assert.strictEqual(personal(v), false, v);   // a single label on a listed TLD is kept even name-shaped (#55)
});

test("a campaign on a private or no-store page never sends its path: (other), as for every other visit (eventpresser-dev-2 on #439)", async () => {
  for (const cc of ["private", "no-store", "private, no-store", "public, no-store", "public, private"]) {
    const mine = () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html", "cache-control": cc } });
    const { events } = await visit({ path: "/members/jane-doe/?utm_source=news", headers: { Accept: "text/html" }, served: mine });
    assert.deepStrictEqual(events, [{ kind: "campaign", source: "news", medium: "", campaign: "", path: "(other)", ts: 1763000000 }], cc);
  }
  const shared = () => new Response("<html></html>", { status: 200, headers: { "content-type": "text/html", "cache-control": "public, max-age=0, must-revalidate" } });
  assert.strictEqual((await visit({ path: "/guide/?utm_source=news", headers: { Accept: "text/html" }, served: shared })).events[0].path, "/guide/");
});

// Radar's person rule, its lines exactly as sethshoultes/radar's workers/api/src/ingest.ts holds them at 2e8b4e15
// (eventpresser-dev-2 on #439): a committed snapshot, fetched from nowhere. edge.js must carry each line as written, so a
// change to a list here fails this test; radar's own test pins the same snapshot, so a change there fails one too. Change
// both sides in step, then this snapshot and the commit named above.
const RADAR_PERSON_RULE = [
  'const KNOWN_HOSTS = new Set(["m.facebook.com", "l.facebook.com", "lm.facebook.com", "news.ycombinator.com", "old.reddit.com", "out.reddit.com", "l.instagram.com"]);',
  "const DOMAIN = /^[a-z0-9-]+\\.(?:com|net|org|io|co|ai|app|dev)$/;",
  "const PERSONAL = [\n  /(^|[._-])(gmail|googlemail|yahoo|ymail|hotmail|outlook|icloud|aol|proton|protonmail|gmx)([._-]|$)/,\n  /[0-9a-f]{16}/,\n  /(^|[._-])[a-z0-9]{24}/,\n];",
  "const DATE = /(?:^|[._-])(?:19|20)\\d\\d[._-]?(?:0[1-9]|1[0-2])(?:[._-]?(?:0[1-9]|[12]\\d|3[01]))?(?=[._-]|$)/;",
  'export const personal = (v) => (v.includes(".") ? !KNOWN_HOSTS.has(v) && !DOMAIN.test(v) : false)\n  || (v.replace(DATE, "").match(/[0-9]/g)?.length ?? 0) >= 7 || PERSONAL.some((re) => re.test(v));',
];

test("the person rule is radar's, line for line: the committed snapshot of ingest.ts at 2e8b4e15 (eventpresser-dev-2 on #439)", async () => {
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "edge.js"), "utf8");
  for (const line of RADAR_PERSON_RULE) assert.ok(source.includes(`\n${line}\n`), line.slice(0, 60));
});

test("the path's exact length edge: 512 characters is a page, 513 is (other) (maint-review-2 on #431)", async () => {
  const at = `/${"x".repeat(511)}`, past = `/${"x".repeat(512)}`;
  assert.strictEqual((await visit({ ua: GPTBOT, path: at })).events[0].path, at);
  assert.strictEqual((await visit({ ua: GPTBOT, path: past })).events[0].path, "(other)");
  assert.strictEqual((await visit({ ua: GPTBOT, path: "/a%4x" })).events[0].path, "(other)", "a % with one hex digit (mi-dev-2 on #431)");
});
