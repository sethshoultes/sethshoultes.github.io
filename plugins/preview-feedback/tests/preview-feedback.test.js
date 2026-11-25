// plugins/preview-feedback (garage-door-smores#206): answers only on a branch preview, only to a reviewer whose
// site-agent session the agent confirms (site-agent#41); keeps every pin; has the agent post it on the branch's PR, and
// says so when it could not.
import test from "node:test";
import assert from "node:assert";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { previewAlias, branchAlias, previewFeedback, commentBody, handle, settings, reviewName, SLOT, fillSlot, studioOrigins } from "../functions/preview-feedback.js";
import { previewFlag, previewState, takePreview, exitPreview, savePin, sentText, signInUrl, newNonce, takeCode, startState, swapCode, PREVIEW_COOKIE, acceptSession, acceptStudio, holding, showChange, clientConfig, pinTarget, takeReviewToken, frameMessage, framePins, frameContext, studioPoint, postNote, TEXT_CAP, byline, closeOn, frameHeight, cardSpot, cardCandidates, pickSpot, pfColours, labelFor, PHONE, HINT_MS, frameBlocked, frameTrouble, FRAME_WAIT_MS, sheetScroll, footColour, liftFor, shortLabel, LABEL_CAP } from "../assets/client.js";
import { existsSync } from "node:fs";

// site-kit#155: the site agent's origin is the site's FEEDBACK_AGENT, never a constant. The tests use a host of their own,
// so anything still hard-coded to the old one fails here.
const AGENT = "https://agent.example.com";
const OLD_AGENT = "https://agent.smartwebutah.com";

const PLUGIN = new URL("../", import.meta.url);
const PREVIEW = "https://mi-dev-1-206-pins.garage-door-smores.pages.dev";
const PNG = "data:image/png;base64," + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]).toString("base64");

// D1 over a real in-memory SQLite running the plugin's own schema.
function d1() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(readFileSync(new URL("schema.sql", PLUGIN), "utf8"));
  const stmt = (text) => ({ args: [], bind(...a) { this.args = a; return this; },
    runNow() { const r = sql.prepare(text).run(...this.args); return { meta: { changes: Number(r.changes) } }; },
    async run() { return this.runNow(); },
    async first() { return sql.prepare(text).get(...this.args) ?? null; },
    async all() { return { results: sql.prepare(text).all(...this.args) }; } });
  // D1's batch: one transaction, every statement or none.
  async function batch(stmts) {
    sql.exec("BEGIN");
    try {
      const out = stmts.map((s) => s.runNow());
      sql.exec("COMMIT");
      return out;
    } catch (err) {
      sql.exec("ROLLBACK");
      throw err;
    }
  }
  return { sql, prepare: stmt, batch };
}

// fetch stand-in for the site agent: its session check (`sessions`: token -> person, else 401) and its comment post
// (`comment`: the status it answers); every call is kept.
const ALIAS = "mi-dev-1-206-pins";
const SESSIONS = {
  "tok-seth-0000000001": { email: "seth@example.test", name: "Seth", alias: ALIAS },
  "tok-rev-00000000002": { email: "rev@example.test", alias: ALIAS },
  "tok-other-000000004": { email: "seth@example.test", name: "Seth", alias: "another-branch" },
  "tok-live-0000000005": { email: "seth@example.test", name: "Seth", alias: "live", origin: "https://garagedoorsmores.com" },   // site-agent#259: signed in on the live site
  "tok-live-noorigin06": { email: "seth@example.test", name: "Seth", alias: "live" },   // an agent that doesn't say the origin
};
const LIVE_SESSION = "tok-live-0000000005";
// Review links (site-kit#38): `reviews` maps a token to the status the agent's GET /review answers (200 live, 410 ended,
// 403 another site; an unknown token is 401), and `idea` is what POST /review-idea answers.
const REV = "r".repeat(43), ENDED = "e".repeat(43), OTHER_SITE = "o".repeat(43);
const REVIEWS = { [REV]: 200, [ENDED]: 410, [OTHER_SITE]: 403 };
// `team` is the names and addresses (lower case) the agent's GET /review?name= answers name_ok: false for (site-agent#91);
// null stands for an agent from before that, which never answers name_ok.
function net({ sessions = SESSIONS, comment = 200, down = false, reviews = REVIEWS, idea = 201, team = ["seth", "seth@example.test"] } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (down) throw new TypeError("fetch failed");
    const auth = init.headers?.Authorization || "";
    const u = new URL(String(url));
    if (`${u.origin}${u.pathname}` === `${AGENT}/sites/smores/review`) {
      const status = reviews[auth.replace(/^Review /, "")] || 401;
      const name = u.searchParams.get("name");
      const named = team && name !== null ? { name_ok: !team.includes(name.trim().toLowerCase()) } : {};
      return new Response(JSON.stringify(status === 200 ? { expires: "2026-11-13T00:00:00Z", cap_left: 50, ...named } : {}), { status });
    }
    if (String(url) === `${AGENT}/sites/smores/comment-code`) {   // site-agent#302: the agent swaps a good code once
      const { code, nonce } = JSON.parse(init.body || "{}");
      return code === "c".repeat(43) && nonce === "n".repeat(43) ? new Response(JSON.stringify({ token: "tok-code-0000000009", expires: "2026-11-25T03:00:00Z" })) : new Response("{}", { status: 404 });
    }
    if (String(url) === `${AGENT}/sites/smores/review-idea`) {
      return new Response(JSON.stringify(idea === 201 ? { id: 42 } : {}), { status: idea });
    }
    const token = auth.replace(/^Bearer /, "");
    if (String(url) === `${AGENT}/sites/smores/session`) {
      return sessions[token] ? new Response(JSON.stringify(sessions[token])) : new Response("{}", { status: 401 });
    }
    if (String(url) === `${AGENT}/sites/smores/comment`) {
      if (comment !== 200) return new Response("{}", { status: comment });
      return new Response(JSON.stringify({ url: "https://github.com/o/r/pull/7#issuecomment-1" }));
    }
    return new Response("unexpected", { status: 500 });
  };
  return calls;
}
const SETH = "tok-seth-0000000001";

// HTMLRewriter stand-in: enough of on(sel, h) to see what the plugin adds and removes. on("body").element(el).append(...)
// adds before </body>. Any other handler is tried with an el whose remove() strips every <script ...></script> the
// selector would match, the page's own, before the append, because HTMLRewriter runs no handler on content it appends.
// It understands the two selector shapes the plugin uses: script[src^="X"] and script[attr].
const scriptsMatching = (sel) => {
  const m = sel.match(/^script\[src\^="([^"]+)"\]$/) || sel.match(/^script\[([a-z-]+)\]$/);
  if (!m) throw new Error(`the stand-in can't match ${sel}`);
  const esc = m[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(sel.includes("src^=") ? `<script\\b[^>]*\\ssrc="${esc}[^"]*"[^>]*></script>` : `<script\\b[^>]*\\s${esc}(?:=|\\s|>)[^>]*></script>`, "g");
};
globalThis.HTMLRewriter = class {
  constructor() { this.hs = []; }
  on(sel, h) { this.hs.push([sel, h]); return this; }
  transform(res) {
    const hs = this.hs;
    return new Response(new ReadableStream({ async start(c) {
      let text = await res.text();
      for (const [sel, h] of hs.filter(([sel]) => sel !== "body")) {
        let removed = false;
        h.element({ remove: () => { removed = true; } });
        if (removed) text = text.replace(scriptsMatching(sel), "");
      }
      const added = [];
      for (const [, h] of hs.filter(([sel]) => sel === "body")) h.element({ append: (html) => added.push(html) });
      c.enqueue(new TextEncoder().encode(text.replace("</body>", `${added.join("")}</body>`)));
      c.close();
    } }), res);
  }
};

// The site's static assets, as Pages binds them: client.js is the plugin's own file. Each fetch's URL is kept.
const CLIENT_URL = "/assets/plugins/preview-feedback/assets/client.js";
const CLIENT_SRC = readFileSync(new URL("../assets/client.js", import.meta.url), "utf8");
const assetsFetched = [];
const ASSETS = (src = CLIENT_SRC) => ({ async fetch(req) {
  assetsFetched.push(req.url);
  return new URL(req.url).pathname === CLIENT_URL ? new Response(src, { headers: { "Content-Type": "text/javascript" } }) : new Response("no", { status: 404 });
} });
const ENV = (db) => ({ FEEDBACK_DB: db, FEEDBACK_PAGES_PROJECT: "garage-door-smores", FEEDBACK_SITE: "smores", FEEDBACK_AGENT: AGENT, ASSETS: ASSETS() });
// The settings a served client.js runs with: its filled slot, read the way the client reads it.
const bakedIn = (src) => clientConfig(JSON.parse(/^const BAKED = (.*);$/m.exec(src)[1].replaceAll("/*pf-config*/", "")));
const TAG = '<script src="/assets/plugins/preview-feedback/assets/client.js" type="module"></script>';
const page = () => new Response("<html><body><h1>Hi</h1></body></html>", { headers: { "Content-Type": "text/html" } });

async function call(path, { db = d1(), env, method = "GET", token, auth, body, origin, host = PREVIEW, next = page, cookie, name, headers: extra } = {}) {
  const headers = { ...extra };
  if (cookie !== undefined) headers.Cookie = cookie;
  if (name !== undefined) headers["X-Review-Name"] = encodeURIComponent(name);
  if (token) headers.Authorization = `Bearer ${token}`;
  if (auth !== undefined) headers.Authorization = auth;
  if (origin !== undefined) headers.Origin = origin;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const request = new Request(`${host}${path}`, { method, headers, body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body) });
  let nexted = 0;
  const res = await previewFeedback({ request, env: env || ENV(db), next: async () => { nexted += 1; return next(); } });
  return { res, nexted, db };
}
const GOOD = { path: "/smores/", selector: "main > h1:nth-of-type(1)", x: 10, y: 4, vw: 390, vh: 844, note: "Make this heading shorter." };
const pins = (db) => db.sql.prepare("SELECT * FROM feedback_pins").all();

test("only a branch preview counts: never production, the bare project host or a deployment hash", () => {
  assert.strictEqual(previewAlias("mi-dev-1-206-pins.garage-door-smores.pages.dev", "garage-door-smores"), "mi-dev-1-206-pins");
  assert.strictEqual(previewAlias("Feature-X.Garage-Door-Smores.pages.dev", "garage-door-smores"), "feature-x");
  for (const host of ["garagedoorsmores.com", "garage-door-smores.pages.dev", "3f2a9c1d.garage-door-smores.pages.dev",
    "x.other-site.pages.dev", "a.b.garage-door-smores.pages.dev", "garage-door-smores.pages.dev.evil.com"]) {
    assert.strictEqual(previewAlias(host, "garage-door-smores"), null, host);
  }
  assert.strictEqual(previewAlias("x.garage-door-smores.pages.dev", ""), null);
  // The production branch's alias serves the production deploy: main by default, or the branch the site names.
  assert.strictEqual(previewAlias("main.garage-door-smores.pages.dev", "garage-door-smores"), null);
  assert.strictEqual(previewAlias("production.garage-door-smores.pages.dev", "garage-door-smores", "production"), null);
  assert.strictEqual(previewAlias("main.garage-door-smores.pages.dev", "garage-door-smores", "production"), "main");
});

test("a branch maps to its Pages alias: lowercase, hyphens, at most 28 characters", () => {
  assert.strictEqual(branchAlias("mi-dev-1/206-pins"), "mi-dev-1-206-pins");
  assert.strictEqual(branchAlias("Feature/Big_Change!"), "feature-big-change");
  assert.strictEqual(branchAlias("a-very-long-branch-name-that-goes-on-and-on"), "a-very-long-branch-name-that");
});

const LIVE_HOSTS = ["https://garagedoorsmores.com", "https://garage-door-smores.pages.dev", "https://3f2a9c1d.garage-door-smores.pages.dev",
  "https://main.garage-door-smores.pages.dev"];

test("on the live site without a review link: no comment code, and a preview session opens nothing", async () => {
  for (const host of LIVE_HOSTS) {
    const calls = net();
    const { res, nexted } = await call("/", { host, token: SETH });
    assert.strictEqual(res, null, host);
    assert.strictEqual(nexted, 0, host);
    // An unrelated cookie is not the review flag.
    assert.strictEqual((await call("/", { host, cookie: "pf_review=0; other=1" })).res, null, host);
    const route = (await call("/__feedback/pins", { host, token: SETH })).res;
    assert.strictEqual(route.status, 401, `${host}: a preview's session is that preview's, never the live site's`);
    assert.ok(!calls.some((c) => c.url.endsWith("/review-idea")), "nothing is filed");
  }
});

test("site-agent#259: a framed live page gets the client, fetched whole and kept apart in caches; an unframed one gets nothing", async () => {
  for (const host of LIVE_HOSTS) {
    const calls = net();
    let seen = null;
    const request = new Request(`${host}/`, { headers: { "Sec-Fetch-Dest": "iframe", "If-None-Match": '"abc"', "If-Modified-Since": "Tue, 24 Nov 2026 00:00:00 GMT" } });
    const res = await previewFeedback({ request, env: ENV(d1()), next: async (req) => { seen = req; return page(); } });
    assert.ok(res, host);
    assert.ok((await res.text()).includes(`${TAG}</body>`), `${host}: the client is on the page`);
    assert.match(res.headers.get("Vary") || "", /Sec-Fetch-Dest/, host);
    assert.ok(seen, `${host}: the page is fetched with its own request`);
    assert.strictEqual(seen.headers.get("If-None-Match"), null, `${host}: no 304 of a copy without the client`);
    assert.strictEqual(seen.headers.get("If-Modified-Since"), null, host);
    assert.ok(!calls.some((c) => c.url.endsWith("/session")), "a framed live page asks the agent nothing");
    // Any other destination, or none, is an ordinary visit: no comment code at all.
    for (const dest of ["document", "empty", "frame", undefined]) {
      const headers = dest === undefined ? {} : { "Sec-Fetch-Dest": dest };
      assert.strictEqual((await call("/", { host, headers })).res, null, `${host} ${dest}`);
    }
  }
  // A live site missing a setting injects nothing, framed or not.
  const bare = { ...ENV(d1()), FEEDBACK_SITE: undefined };
  const r = await previewFeedback({ request: new Request(`${LIVE_HOSTS[0]}/`, { headers: { "Sec-Fetch-Dest": "iframe" } }), env: bare, next: page });
  assert.strictEqual(r, null);
});

test("site-agent#259 part 2: ?preview=true or the visit's pf_preview=1 cookie loads the client on the live site; nothing else does", async () => {
  for (const host of LIVE_HOSTS) {
    net();
    for (const [path, cookie] of [["/?preview=true", undefined], ["/about/", "pf_preview=1"], ["/about/", "a=1; pf_preview=1"]]) {
      const { res } = await call(path, { host, cookie });
      assert.ok(res && (await res.text()).includes(`${TAG}</body>`), `${host}${path} ${cookie}`);
    }
    for (const [path, cookie] of [["/?preview=1", undefined], ["/?preview=yes", undefined], ["/", "pf_preview=0"], ["/", "xpf_preview=1"]]) {
      assert.strictEqual((await call(path, { host, cookie })).res, null, `${host}${path} ${cookie}`);
    }
  }
});

test("site-agent#259 part 2: on the live site a note needs the agent's live sign-in, and goes to the board under that session", async () => {
  const host = LIVE_HOSTS[0];
  const calls = net();
  const signedOut = await call("/__feedback/pins", { host, method: "POST", origin: host, body: GOOD });
  assert.strictEqual(signedOut.res.status, 401, "signed out: nothing can be sent");
  const other = await call("/__feedback/pins", { host, method: "POST", origin: host, body: GOOD, token: "tok-other-000000004" });
  assert.strictEqual(other.res.status, 401, "a preview's session is not the live site's");
  assert.ok(!calls.some((c) => c.url.endsWith("/review-idea")));
  const listed = await (await call("/__feedback/pins?path=/", { host, token: LIVE_SESSION })).res.json();
  assert.deepStrictEqual(listed, { pins: [], who: "Seth" }, "the live site keeps no pins to list");
  const { res } = await call("/__feedback/pins", { host, method: "POST", origin: host, body: GOOD, token: LIVE_SESSION });
  assert.strictEqual(res.status, 201);
  const out = await res.json();
  assert.strictEqual(out.posted, true);
  const sent = calls.find((c) => c.url.endsWith("/review-idea"));
  assert.strictEqual(sent.init.headers.Authorization, `Bearer ${LIVE_SESSION}`, "the agent checks the session itself");
  const body = JSON.parse(sent.init.body);
  assert.strictEqual(body.page, `${host}${GOOD.path}`);
  assert.strictEqual(body.selector, GOOD.selector);
  assert.strictEqual(body.note, GOOD.note);
  assert.strictEqual(body.text, "", "no words sent, none forwarded");
  // site-kit#689: the element's words go to the agent with the note, cleaned of control characters and capped at 300.
  await call("/__feedback/pins", { host, method: "POST", origin: host, body: { ...GOOD, text: "Desserts\u0007 from Around the World" + "x".repeat(400) }, token: LIVE_SESSION });
  const worded = JSON.parse(calls.filter((c) => c.url.endsWith("/review-idea")).at(-1).init.body);
  assert.strictEqual(worded.text, ("Desserts from Around the World" + "x".repeat(400)).slice(0, 300));
  // The session is bound to the live origin it was signed in on: on the site's other addresses, or from an agent that
  // doesn't say the origin, it is refused and nothing is filed.
  const before = calls.filter((c) => c.url.endsWith("/review-idea")).length;
  for (const h of LIVE_HOSTS.slice(1)) {
    assert.strictEqual((await call("/__feedback/pins", { host: h, method: "POST", origin: h, body: GOOD, token: LIVE_SESSION })).res.status, 401, h);
  }
  assert.strictEqual((await call("/__feedback/pins", { host, method: "POST", origin: host, body: GOOD, token: "tok-live-noorigin06" })).res.status, 401, "no origin, no note");
  assert.strictEqual(calls.filter((c) => c.url.endsWith("/review-idea")).length, before);
  // From another page's origin, nothing is sent.
  assert.strictEqual((await call("/__feedback/pins", { host, method: "POST", origin: "https://evil.example", body: GOOD, token: LIVE_SESSION })).res.status, 403);
});

test("site-agent#259 part 2 (mi-dev-5 on #682): previewState turns Feedback on only on the live site and only with the flag", () => {
  assert.deepStrictEqual(previewState(true, "https://garagedoorsmores.com/?preview=true", ""), { on: true, set: PREVIEW_COOKIE });
  // A later page of the visit reads the cookie and writes nothing, so the two hours run from the link.
  assert.deepStrictEqual(previewState(true, "https://garagedoorsmores.com/about/", "pf_preview=1"), { on: true, set: null });
  // A live page that holds the client another way: a review visit's new tab, or the Studio's frame. No flag, no button.
  for (const [live, href, cookie] of [[true, "https://garagedoorsmores.com/about/", "pf_review=1"], [true, "https://garagedoorsmores.com/", ""],
    [false, "https://agent-abc.garage-door-smores.pages.dev/?preview=true", "pf_preview=1"], [true, "https://garagedoorsmores.com/?preview=false", "pf_preview=1"]]) {
    assert.deepStrictEqual(previewState(live, href, cookie), { on: false, set: null }, `${href} ${cookie}`);
  }
});

test("site-agent#259 (the lead's ruling): the visit's cookie lasts two hours, not the whole browser session", () => {
  assert.match(PREVIEW_COOKIE, /^pf_preview=1; /);
  assert.match(PREVIEW_COOKIE, /; Max-Age=7200;/);
  assert.match(PREVIEW_COOKIE, /; path=\/;/);
});

test("site-agent#259 (mi-dev-5's second read on #682): takePreview, the call start() makes, writes the cookie only for ?preview=true", () => {
  const writes = [];
  const write = (c) => writes.push(c);
  for (const [live, href, cookie] of [
    [true, "https://garagedoorsmores.com/about/", "pf_review=1"],
    [true, "https://garagedoorsmores.com/", ""],
    [false, "https://agent-abc.garage-door-smores.pages.dev/?preview=true", "pf_preview=1"],
    [true, "https://garagedoorsmores.com/?preview=false", "pf_preview=1"],
  ]) assert.strictEqual(takePreview(live, href, cookie, write), false, `${href} ${cookie}`);
  assert.deepStrictEqual(writes, [], "no cookie, so no button, on any of them");
  assert.strictEqual(takePreview(true, "https://garagedoorsmores.com/about/", "pf_preview=1", write), true, "a later page: on");
  assert.deepStrictEqual(writes, [], "and it writes nothing, so the two hours don't move");
  assert.strictEqual(takePreview(true, "https://garagedoorsmores.com/?preview=true", "", write), true);
  assert.deepStrictEqual(writes, [PREVIEW_COOKIE]);
});

test("site-agent#259 (the lead's ruling): Exit feedback clears the cookie and reloads without ?preview", () => {
  const writes = [], went = [];
  exitPreview("https://garagedoorsmores.com/recipes/baklava/?preview=true&x=1#steps", (c) => writes.push(c), (u) => went.push(u));
  assert.deepStrictEqual(writes, ["pf_preview=; path=/; Max-Age=0; SameSite=Lax; Secure"]);
  assert.deepStrictEqual(went, ["https://garagedoorsmores.com/recipes/baklava/?x=1#steps"]);
  // A double-slash path stays on the page's own host (a bare "//evil.example/x" would leave it).
  exitPreview("https://garagedoorsmores.com//evil.example/x?preview=true", () => {}, (u) => went.push(u));
  assert.strictEqual(new URL(went[1], "https://garagedoorsmores.com/").host, "garagedoorsmores.com");
  // The page wires it: the control shows on a ?preview=true visit, and its click calls exitPreview.
  const src = readFileSync(new URL("../assets/client.js", import.meta.url), "utf8");
  assert.match(src, /if \(first\.exit\) \{\s*ui\.exit = exitControl\(\);\s*ui\.bar\.append\(ui\.exit\);/);   // when: startState
  assert.match(src, /function exitControl\(\) \{[^]*?x\.addEventListener\("click", \(e\) => \{ e\.stopPropagation\(\); exitPreview\(location\.href\); \}\);/);
  assert.match(src, /x\.setAttribute\("aria-label", "Exit feedback"\);/);
});

test("site-agent#259 (the lead's ruling): ?preview=false loads no client and the edge clears the visit's cookie", async () => {
  for (const host of LIVE_HOSTS) {
    net();
    const { res, nexted } = await call("/?preview=false", { host, cookie: "pf_preview=1" });
    assert.ok(res, host);
    assert.strictEqual(nexted, 1, `${host}: the page itself`);
    assert.ok(!(await res.text()).includes(TAG), `${host}: no client`);
    assert.strictEqual(res.headers.get("Set-Cookie"), "pf_preview=; path=/; Max-Age=0; SameSite=Lax; Secure", host);
    // Without ?preview=false, an ordinary visit is untouched and nothing is cleared.
    assert.strictEqual((await call("/", { host })).res, null, host);
  }
  assert.strictEqual(previewFlag("https://garagedoorsmores.com/?preview=false", "pf_preview=1"), false, "the client agrees");
});

test("site-agent#259 part 2: previewFlag is exactly ?preview=true or the pf_preview=1 cookie", () => {
  assert.strictEqual(previewFlag("https://garagedoorsmores.com/?preview=true", ""), true);
  assert.strictEqual(previewFlag("https://garagedoorsmores.com/about/", "x=1; pf_preview=1"), true);
  for (const [href, cookie] of [["https://garagedoorsmores.com/?preview=TRUE", ""], ["https://garagedoorsmores.com/?preview=1", ""], ["https://garagedoorsmores.com/", "pf_preview=10"], ["https://garagedoorsmores.com/", "pf_preview=1x"], ["https://garagedoorsmores.com/", undefined]]) {
    assert.strictEqual(previewFlag(href, cookie), false, `${href} ${cookie}`);
  }
});

test("on a ready preview the page gets the client script; anything not HTML passes untouched", async () => {
  net();
  const { res } = await call("/smores/");
  assert.ok((await res.text()).includes(`${TAG}</body>`));
  const css = await call("/assets/site.css", { next: () => new Response("a{}", { headers: { "Content-Type": "text/css" } }) });
  assert.strictEqual(await css.res.text(), "a{}");
});

test("a preview missing any binding gets no button, and its routes say so", async () => {
  for (const missing of Object.keys(ENV(null)).filter((k) => k.startsWith("FEEDBACK_"))) {   // ASSETS is Pages' own
    net();
    const env = ENV(d1());
    delete env[missing];
    assert.strictEqual((await call("/smores/", { env })).res, null, missing);
    const route = (await call("/__feedback/pins", { env, token: SETH })).res;
    // Without the project name it cannot tell a preview from production, so it stays out of the way entirely.
    if (missing === "FEEDBACK_PAGES_PROJECT") assert.strictEqual(route, null);
    else assert.strictEqual(route.status, 503, missing);
  }
});

test("a malformed site key counts as not set up: no button, and its routes say so", async () => {
  for (const bad of ["Smores", "-x", "a b", "x".repeat(41), '"><script>']) {
    net();
    const env = { ...ENV(d1()), FEEDBACK_SITE: bad };
    assert.strictEqual((await call("/smores/", { env })).res, null, bad);
    assert.strictEqual((await call("/__feedback/pins", { env, token: SETH })).res.status, 503, bad);
  }
});

test("site-kit#155: a malformed FEEDBACK_AGENT counts as not set up: no button, and its routes say so", async () => {
  // It goes into the page's tag and every origin check, so only exactly https://<host> passes.
  for (const bad of ["http://agent.example.com", "https://agent.example.com/", "https://Agent.example.com", "https://agent.example.com:8443",
    "https://agent.example.com/x", "agent.example.com", "https://localhost", '"><script>', "https://a.example.com\"x"]) {
    net();
    const env = { ...ENV(d1()), FEEDBACK_AGENT: bad };
    assert.strictEqual((await call("/smores/", { env })).res, null, bad);
    assert.strictEqual((await call("/__feedback/pins", { env, token: SETH })).res.status, 503, bad);
  }
});

test("site-kit#155: the agent the site names is the one it calls; the old constant's host is never called", async () => {
  const calls = net();
  await call("/__feedback/pins", { method: "POST", token: SETH, body: GOOD });
  assert.ok(calls.length > 0 && calls.every((c) => c.url.startsWith(`${AGENT}/`)), JSON.stringify(calls.map((c) => c.url)));
  assert.ok(!calls.some((c) => c.url.startsWith(OLD_AGENT)));
});

test("the client the edge serves names the site, so it signs in to the right one", async () => {
  net();
  assert.strictEqual(bakedIn(await (await call(CLIENT_URL)).res.text()).site, "smores");
});

test("every route but the screenshot needs a session the agent confirms, and nothing is kept without one", async () => {
  for (const [opts, auth] of [
    [{}, undefined],
    [{}, "Bearer short"],
    [{}, "Basic tok-seth-0000000001"],
    [{}, "Bearer tok-nobody-000000003"],
    [{ down: true }, `Bearer ${SETH}`],
    [{ sessions: { [SETH]: { alias: ALIAS } } }, `Bearer ${SETH}`],
    [{ sessions: { [SETH]: { name: "Seth" } } }, `Bearer ${SETH}`],
    [{}, "Bearer tok-other-000000004"],
  ]) {
    net(opts);
    const { res, db } = await call("/__feedback/pins", { method: "POST", auth, origin: new URL(PREVIEW).origin, body: GOOD });
    assert.strictEqual(res.status, 401, String(auth));
    assert.strictEqual(pins(db).length, 0);
    assert.strictEqual((await call("/__feedback/pins?path=%2F", { auth })).res.status, 401);
  }
  // The check is the agent's, for this site, with the reviewer's own token.
  const calls = net();
  assert.strictEqual((await call("/__feedback/pins?path=%2F", { token: SETH })).res.status, 200);
  assert.deepStrictEqual(calls.map((c) => [c.url, c.init.headers.Authorization]), [[`${AGENT}/sites/smores/session`, `Bearer ${SETH}`]]);
});

test("a pin is kept and the agent posts it on the branch's PR, with the page, the element and the screenshot link", async () => {
  const calls = net();
  const { res, db } = await call("/__feedback/pins", { method: "POST", token: SETH, origin: new URL(PREVIEW).origin, body: { ...GOOD, shot: PNG } });
  assert.strictEqual(res.status, 201);
  const out = await res.json();
  assert.strictEqual(out.posted, true);
  const [row] = pins(db);
  assert.deepStrictEqual([row.alias, row.path, row.author, row.status, row.comment_url], ["mi-dev-1-206-pins", "/smores/", "Seth", "open", "https://github.com/o/r/pull/7#issuecomment-1"]);
  const post = calls.find((c) => c.url === `${AGENT}/sites/smores/comment`);
  assert.strictEqual(post.init.method, "POST");
  assert.strictEqual(post.init.headers.Authorization, `Bearer ${SETH}`);
  const sent = JSON.parse(post.init.body);
  assert.deepStrictEqual(Object.keys(sent).sort(), ["alias", "body"]);
  assert.strictEqual(sent.alias, "mi-dev-1-206-pins");
  assert.ok(sent.body.includes(`${new URL(PREVIEW).origin}/smores/`));
  assert.ok(sent.body.includes("`main > h1:nth-of-type(1)`"));
  assert.ok(sent.body.includes(`/__feedback/shot/${row.id}`));
  assert.ok(sent.body.includes(`<!-- preview-feedback:pin=${row.id} -->`));
  assert.ok(!sent.body.includes("Access"));
});

test("when the agent cannot post it, the pin is still kept and the reviewer is told why", async () => {
  for (const [opts, why] of [
    [{ comment: 409 }, /no single open pull request/],
    [{ comment: 429 }, /too many comments/],
    [{ comment: 401 }, /sign in again/],
    [{ comment: 403 }, /another preview/],
    [{ comment: 500 }, /HTTP 500/],
  ]) {
    net(opts);
    const { res, db } = await call("/__feedback/pins", { method: "POST", token: SETH, origin: new URL(PREVIEW).origin, body: GOOD });
    const out = await res.json();
    assert.strictEqual(out.posted, false);
    assert.match(out.why, why);
    assert.strictEqual(pins(db).length, 1);
    assert.strictEqual(pins(db)[0].comment_url, null);
  }
});

test("bad input is refused and nothing is kept", async () => {
  const cases = [
    [{ ...GOOD, path: "//evil.example/x" }, 400], [{ ...GOOD, path: "/a\n- Page: https://evil.example" }, 400], [{ ...GOOD, path: "/a b" }, 400], [{ ...GOOD, note: "  " }, 400], [{ ...GOOD, selector: "" }, 400],
    [{ ...GOOD, x: "left" }, 400], [{ ...GOOD, shot: "data:image/png;base64,PHN2Zz4=" }, 400],
    [{ ...GOOD, shot: "data:image/svg+xml;base64,PHN2Zz4=" }, 400], [{ ...GOOD, shot: "data:image/png;base64,!!not base64!!" }, 400], [{ ...GOOD, note: "x".repeat(500_000) }, 413], ["{nope", 400],
  ];
  for (const [body, status] of cases) {
    net();
    const { res, db } = await call("/__feedback/pins", { method: "POST", token: SETH, origin: new URL(PREVIEW).origin, body });
    assert.strictEqual(res.status, status, JSON.stringify(body).slice(0, 60));
    assert.strictEqual(pins(db).length, 0);
  }
  net();
  const other = await call("/__feedback/pins", { method: "POST", token: SETH, origin: "https://evil.example", body: GOOD });
  assert.strictEqual(other.res.status, 403);
  assert.strictEqual(pins(other.db).length, 0);
});

test("pins reload for the page, resolve once, and stay with their own branch", async () => {
  net();
  const db = d1();
  const origin = new URL(PREVIEW).origin;
  await call("/__feedback/pins", { db, method: "POST", token: SETH, origin, body: { ...GOOD, shot: PNG } });
  const listed = await (await call("/__feedback/pins?path=%2Fsmores%2F", { db, token: SETH })).res.json();
  assert.strictEqual(listed.pins.length, 1);
  const id = listed.pins[0].id;
  assert.ok(!("shot" in listed.pins[0]) && !("ua" in listed.pins[0]));
  const elsewhere = "https://another-branch.garage-door-smores.pages.dev";
  assert.strictEqual((await call(`/__feedback/pins/${id}/resolve`, { db, host: elsewhere, method: "POST", token: "tok-other-000000004", origin: elsewhere })).res.status, 404);
  assert.strictEqual((await call(`/__feedback/shot/${id}`, { db, host: elsewhere })).res.status, 404);
  // This preview's session is no key to another preview's routes.
  assert.strictEqual((await call(`/__feedback/pins/${id}/resolve`, { db, host: elsewhere, method: "POST", token: SETH })).res.status, 401);
  // The PR comment links the screenshot and its reader has no session here: it needs none.
  const shot = (await call(`/__feedback/shot/${id}`, { db })).res;
  assert.strictEqual(shot.status, 200);
  assert.strictEqual(shot.headers.get("Content-Type"), "image/png");
  assert.strictEqual(shot.headers.get("X-Content-Type-Options"), "nosniff");
  assert.strictEqual((await call(`/__feedback/pins/${id}/resolve`, { db, method: "POST", token: "tok-rev-00000000002", origin: PREVIEW })).res.status, 200);
  assert.deepStrictEqual([pins(db)[0].status, pins(db)[0].resolved_by], ["resolved", "rev@example.test"]);
  assert.strictEqual((await call(`/__feedback/pins/${id}/resolve`, { db, method: "POST", token: SETH, origin: PREVIEW })).res.status, 404);
  assert.strictEqual((await (await call("/__feedback/pins?path=%2Fsmores%2F", { db, token: SETH })).res.json()).pins.length, 0);
});

test("the PR comment cannot be turned into markup, links or mentions by what a reviewer types", () => {
  const body = commentBody({ id: "x", path: "/a/", selector: "a[href`=x`]", x: 1, y: 2, vw: 3, vh: 4, has_shot: false,
    author: "seth@example.test", note: "```\n@someone [click](https://evil.example)\n```" }, "https://p.example");
  const fence = body.split("\n").filter((l) => l === "```text" || l === "```");
  assert.deepStrictEqual(fence, ["```text", "```"], "the note cannot close its own fence");
  assert.ok(!body.includes("a[href`=x`]"), "a backtick cannot end the inline code");
});

test("the vendored screenshot library is the file its sha256 names", () => {
  const file = readFileSync(new URL("assets/modern-screenshot.mjs", PLUGIN));
  assert.strictEqual(createHash("sha256").update(file).digest("hex"), readFileSync(new URL("assets/modern-screenshot.mjs.sha256", PLUGIN), "utf8").trim());
});

test("plugin.json is the folder's contract: its name, a version, files that exist, and an edge module exporting handle", async () => {
  const manifest = JSON.parse(readFileSync(new URL("plugin.json", PLUGIN), "utf8"));
  assert.strictEqual(manifest.name, "preview-feedback");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  for (const f of [...manifest.assets, manifest.edge.module, "plugin.py"]) assert.ok(existsSync(new URL(f, PLUGIN)), f);
  // The Function injects the client at the path a site's loader copies it to: assets/plugins/<name>/<asset path>.
  const src = readFileSync(new URL(manifest.edge.module, PLUGIN), "utf8");
  assert.ok(src.includes(`"/assets/plugins/${manifest.name}/assets/client.js"`) && manifest.assets.includes("assets/client.js"));
  const mod = await import(new URL(manifest.edge.module, PLUGIN));
  assert.strictEqual(typeof mod.handle, "function");
  // 0.17.0 (site-agent#259 part a): four settings with values, never names of variables; the edge reads its data file.
  assert.deepStrictEqual(Object.keys(manifest.config.fields).sort(), ["agent", "pages_project", "site", "studio"]);
  assert.strictEqual(manifest.edge.data, "feedback-data.json");
});

test("site-agent#259 part (a): the settings come from the plugin's data, and a FEEDBACK_* variable that is set wins", () => {
  const data = { config: { site: "smores", agent: AGENT, studio: "https://agent.smartwebutah.com", pages_project: "garage-door-smores" } };
  const db = {};
  assert.deepStrictEqual(settings({ FEEDBACK_DB: db, OTHER: "x" }, data), {
    FEEDBACK_DB: db, OTHER: "x", FEEDBACK_SITE: "smores", FEEDBACK_AGENT: AGENT, FEEDBACK_STUDIO: "https://agent.smartwebutah.com",
    FEEDBACK_PAGES_PROJECT: "garage-door-smores",
  });
  assert.strictEqual(settings({ FEEDBACK_SITE: "from-vars" }, data).FEEDBACK_SITE, "from-vars", "a set variable wins");
  assert.strictEqual(settings({ FEEDBACK_SITE: "" }, data).FEEDBACK_SITE, "smores", "an empty one does not");
  for (const bad of [undefined, null, "x", {}, { config: null }, { config: { site: 7, agent: ["a"] } }]) {
    assert.deepStrictEqual(settings({ A: 1 }, bad), { A: 1 }, JSON.stringify(bad));
  }
  assert.deepStrictEqual(settings(undefined, { config: { nope: "x" } }), {}, "only the four keys are read");
});

test("site-agent#259 part (a): with no FEEDBACK_* variables, handle() runs the live site from its data alone", async () => {
  net();
  const env = { ASSETS: ASSETS() };   // a production site whose settings came from the registry, not [vars]
  const data = { config: { site: "smores", agent: AGENT, pages_project: "garage-door-smores" } };
  const res = await handle({ request: new Request(`${LIVE_SITE}/smores/?preview=true`), env, next: async () => page() }, data);
  assert.match(await res.text(), /preview-feedback\/assets\/client\.js/, "?preview=true loads the client");
  const js = await handle({ request: new Request(`${LIVE_SITE}${CLIENT_URL}`), env, next: async () => page() }, data);
  const body = await js.text();
  assert.ok(body.includes('"smores"') && body.includes(JSON.stringify(AGENT)), "client.js is filled with the data's site and agent");
  assert.strictEqual(await handle({ request: new Request(`${LIVE_SITE}/smores/`), env, next: async () => page() }, data), null, "an ordinary visit gets nothing");
  // With neither data nor variables the site is not set up: client.js is left alone, as before 0.17.0.
  assert.strictEqual(await handle({ request: new Request(`${LIVE_SITE}${CLIENT_URL}`), env, next: async () => page() }, {}), null);
});

test("handle(context, config, newRewriter) uses the rewriter it is given, as the sites' chain passes one", async () => {
  net();
  let made = 0;
  const factory = () => { made += 1; return new globalThis.HTMLRewriter(); };
  const request = new Request(`${PREVIEW}/smores/`);
  const res = await handle({ request, env: ENV(d1()), next: async () => page() }, {}, factory);
  assert.strictEqual(made, 1);
  assert.match(await res.text(), /client\.js/);
  assert.strictEqual(await handle({ request: new Request("https://garagedoorsmores.com/"), env: ENV(d1()), next: async () => page() }, {}, factory), null);
});

test("site-agent#164: the client takes the studio only from the agent, for its own site, from the window it is framed in", () => {
  const parent = { name: "the studio" };
  const ok = { type: "pf-studio", site: "smores" };
  const studios = [AGENT, "https://agent.smores.example"];
  assert.deepStrictEqual(acceptStudio({ origin: AGENT, data: ok, source: parent }, "smores", studios, parent), { win: parent, origin: AGENT, show: null });
  assert.deepStrictEqual(acceptStudio({ origin: studios[1], data: ok, source: parent }, "smores", studios, parent), { win: parent, origin: studios[1], show: null }, "the site's branded studio host, answered at its own origin");
  for (const [why, event] of [
    ["another origin", { origin: "https://evil.example", data: ok, source: parent }],
    ["the preview itself", { origin: new URL(PREVIEW).origin, data: ok, source: parent }],
    ["another site", { origin: AGENT, data: { ...ok, site: "foo" }, source: parent }],
    ["another type", { origin: AGENT, data: { ...ok, type: "pf-posted" }, source: parent }],
    ["no data", { origin: AGENT, data: null, source: parent }],
    ["a window that isn't the parent (a popup, another frame)", { origin: AGENT, data: ok, source: { name: "elsewhere" } }],
    ["a host that merely ends like a studio", { origin: "https://evil.agent.example.com", data: ok, source: parent }],
  ]) assert.strictEqual(acceptStudio(event, "smores", studios, parent), null, why);
  assert.strictEqual(acceptStudio({ origin: AGENT, data: ok, source: parent }, "smores", [], parent), null, "no studio named");
  assert.strictEqual(acceptStudio({ origin: AGENT, data: { ...ok, site: "" }, source: parent }, "", studios, parent), null, "no site");
  assert.strictEqual(acceptStudio({ origin: AGENT, data: ok, source: parent }, "smores", studios, null), null, "not framed");
});

test("0.9.0: a greeting may name the text a change added, and the page finds the block that holds it (site-agent#164)", () => {
  const parent = { name: "studio" }, ok = { type: "pf-studio", site: "smores" };
  const show = (v) => acceptStudio({ origin: AGENT, data: { ...ok, show: v }, source: parent }, "smores", [AGENT], parent).show;
  assert.strictEqual(show("  Cover the pan\n with a damp towel. "), "Cover the pan with a damp towel.");
  for (const bad of [undefined, null, 7, "", "x", " ", "y".repeat(301), ["Cover"]]) assert.strictEqual(show(bad), null, String(bad));
  assert.strictEqual(show("y".repeat(300)).length, 300);
  const page = ["Baklava", "Layer the phyllo.\n  Cover the pan with a   damp towel.", "Cover the pan with a damp towel. Again."];
  assert.strictEqual(holding(page, "Cover the pan with a damp towel."), 1, "the first block that holds it, spaces collapsed");
  assert.strictEqual(holding(page, "not on the page"), -1);
  assert.strictEqual(holding(page, "   "), -1, "nothing to find");
  assert.strictEqual(holding([null, undefined, "x"], "x"), 2);
});

test("0.9.0: showChange outlines one block at a time and always puts the page's own outline back (game-review on #196)", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const block = (text, outline = "") => ({ textContent: text, style: { outline, outlineOffset: "" }, scrolled: 0, scrollIntoView() { this.scrolled++; } });
  const a = block("Cover the pan with a damp towel.", "1px dotted red"), b = block("Rest it four hours.");
  const was = { document: globalThis.document, window: globalThis.window };
  globalThis.document = { querySelectorAll: () => [a, b] };
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  try {
    showChange("damp towel");
    assert.match(a.style.outline, /^3px solid/);
    assert.strictEqual(a.scrolled, 1);
    t.mock.timers.tick(1000);
    showChange("damp towel"); // the same text again within four seconds
    t.mock.timers.tick(3500);
    assert.match(a.style.outline, /^3px solid/, "still lit: the first call's timer was cancelled");
    t.mock.timers.tick(1000);
    assert.deepStrictEqual([a.style.outline, a.style.outlineOffset], ["1px dotted red", ""], "the page's own outline, not a highlight");
    t.mock.timers.tick(10000);
    assert.strictEqual(a.style.outline, "1px dotted red", "and it stays that way");
    showChange("damp towel");
    showChange("four hours"); // another block: the first goes back at once
    assert.strictEqual(a.style.outline, "1px dotted red");
    assert.match(b.style.outline, /^3px solid/);
    t.mock.timers.tick(4000);
    assert.strictEqual(b.style.outline, "");
    showChange("not on the page");
    assert.strictEqual(a.style.outline, "1px dotted red", "nothing found: nothing changes");
  } finally {
    globalThis.document = was.document;
    globalThis.window = was.window;
  }
});

test("the studio's origins: FEEDBACK_STUDIO's well-formed origins, else the agent (site-agent#164)", () => {
  assert.deepStrictEqual(studioOrigins({ FEEDBACK_AGENT: AGENT }), [AGENT]);
  assert.deepStrictEqual(studioOrigins({ FEEDBACK_AGENT: AGENT, FEEDBACK_STUDIO: "https://agent.smores.example  https://agent.example.com" }), ["https://agent.smores.example", AGENT]);
  assert.deepStrictEqual(studioOrigins({ FEEDBACK_AGENT: AGENT, FEEDBACK_STUDIO: "https://a.example/ http://b.example https://C.example *" }), [AGENT], "none well formed: the agent");
  assert.deepStrictEqual(studioOrigins({ FEEDBACK_AGENT: AGENT, FEEDBACK_STUDIO: "https://a.example https://a.example" }), ["https://a.example"]);
  assert.strictEqual(studioOrigins({ FEEDBACK_AGENT: AGENT, FEEDBACK_STUDIO: "https://a.example https://b.example https://c.example https://d.example https://e.example" }).length, 4);
  assert.deepStrictEqual(clientConfig({ site: "smores", agent: AGENT, studio: [AGENT, "javascript:x", 7, "https://agent.smores.example"] }).studio, [AGENT, "https://agent.smores.example"]);
  assert.deepStrictEqual(clientConfig({ site: "smores", agent: AGENT, studio: "https://agent.smores.example" }).studio, [], "only a baked list");
});

test("the client takes a session only from the site agent, for its own site", () => {
  const ok = { type: "site-agent-comment-session", site: "smores", token: "tok-seth-0000000001", expires: "2026-11-05T22:00:00Z" };
  assert.deepStrictEqual(acceptSession({ origin: AGENT, data: ok }, "smores", AGENT), { token: ok.token, expires: ok.expires });
  for (const [origin, data] of [
    ["https://evil.example", ok],
    [new URL(PREVIEW).origin, ok],
    [AGENT, { ...ok, site: "foo" }],
    [AGENT, { ...ok, type: "something-else" }],
    [AGENT, { ...ok, token: "" }],
    [AGENT, { ...ok, token: 42 }],
    [AGENT, null],
  ]) assert.strictEqual(acceptSession({ origin, data }, "smores", AGENT), null, `${origin} ${JSON.stringify(data)}`);
  // site-kit#155: the old constant's origin is just another origin now, and with no agent named nothing is taken
  assert.strictEqual(acceptSession({ origin: OLD_AGENT, data: ok }, "smores", AGENT), null);
  assert.strictEqual(acceptSession({ origin: AGENT, data: ok }, "smores", ""), null);
  const win = {};
  assert.strictEqual(frameMessage({ source: win, origin: AGENT, data: { type: "pf-posted" } }, win, ""), null, "no agent named");
});

test("site-kit#180: the client's settings are only what the edge baked in, checked; raw, it does nothing", () => {
  assert.deepStrictEqual(clientConfig({ site: "smores", agent: AGENT, scope: "preview", frame: true }), { site: "smores", live: false, agent: AGENT, studio: [], framed: true });
  assert.deepStrictEqual(clientConfig({ site: "smores", agent: AGENT, scope: "live", frame: true }), { site: "smores", live: true, agent: AGENT, studio: [], framed: false });
  for (const bad of ["http://agent.example.com", "https://agent.example.com/", "https://Agent.example.com", "javascript:alert(1)", "", 42]) {
    assert.strictEqual(clientConfig({ site: "smores", agent: bad, scope: "preview" }).agent, "", String(bad));
  }
  assert.strictEqual(clientConfig({ site: "smores", agent: AGENT, frame: "1" }).framed, false, "only a baked true turns the frame on");
  // The file as vendored has an empty slot and reads no URL, so a copy served without the edge names no agent.
  assert.strictEqual(CLIENT_SRC.split(SLOT).length, 2, "exactly one slot");
  assert.strictEqual(bakedIn(CLIENT_SRC).agent, "");
  assert.doesNotMatch(CLIENT_SRC, /import\.meta|location\.search|searchParams\.get\("agent"\)|__previewFeedbackAgent/);
});

test("site-kit#180: a query-string agent on client.js is ignored: every copy gets the site's FEEDBACK_AGENT", async () => {
  net();
  const evil = encodeURIComponent("https://evil.example.com");
  for (const q of ["", `?agent=${evil}`, `?site=other&agent=${evil}&scope=live&frame=1`, `?agent=${evil}&agent=${evil}`, `?studio=${evil}`]) {
    assetsFetched.length = 0;
    const { res, nexted } = await call(`${CLIENT_URL}${q}`);
    const src = await res.text();
    assert.strictEqual(res.status, 200, q);
    assert.deepStrictEqual(bakedIn(src), { site: "smores", live: false, agent: AGENT, studio: [AGENT], framed: false }, q);
    assert.ok(!src.includes("evil.example.com"), q);
    assert.strictEqual(res.headers.get("Cache-Control"), "no-store");
    assert.match(res.headers.get("Content-Type"), /^text\/javascript/);
    assert.deepStrictEqual(assetsFetched, [`${PREVIEW}${CLIENT_URL}`], "the asset is fetched without the query");
    assert.strictEqual(nexted, 0);
  }
});

test("site-kit#180: a page that loads its own copy of the client, with another agent, still gets the site's agent", async () => {
  net();
  const evil = encodeURIComponent("https://evil.example.com");
  // Whatever tag or import() the page's script uses, the copy that runs first is one the edge served.
  const page = () => new Response(`<html><body><script type="module">import("${CLIENT_URL}?agent=${evil}")</script></body></html>`, { headers: { "Content-Type": "text/html" } });
  const html = await (await call("/smores/", { next: page })).res.text();
  const src = /import\("([^"]+)"\)/.exec(html)[1];
  const served = await (await call(src)).res.text();
  assert.strictEqual(bakedIn(served).agent, AGENT);
});

test("site-kit#180: not set up, the edge leaves client.js alone; a client.js with no slot is refused, not served unfilled", async () => {
  net();
  const db = d1();
  const { res, nexted } = await call(CLIENT_URL, { env: { ...ENV(db), FEEDBACK_AGENT: "" } });
  assert.strictEqual(res, null);
  assert.strictEqual(nexted, 0);
  const old = await call(CLIENT_URL, { env: { ...ENV(db), ASSETS: ASSETS("const x = new URL(import.meta.url);") } });
  assert.strictEqual(old.res.status, 500);
  const twice = await call(CLIENT_URL, { env: { ...ENV(db), ASSETS: ASSETS(`${SLOT}${SLOT}`) } });
  assert.strictEqual(twice.res.status, 500);
});

test("site-kit#180: a conditional request still gets a filled 200: the request's headers are not forwarded to the asset fetch", async () => {
  net();
  const seen = [];
  const conditional = { async fetch(req) {                       // a static host answers a conditional request with a bodiless 304
    seen.push(req.headers.get("If-None-Match"));
    return req.headers.get("If-None-Match") ? new Response(null, { status: 304 }) : new Response(CLIENT_SRC, { headers: { "Content-Type": "text/javascript" } });
  } };
  const { res } = await call(CLIENT_URL, { headers: { "If-None-Match": '"abc"', "If-Modified-Since": "Wed, 01 Jan 2025 00:00:00 GMT" }, env: { ...ENV(d1()), ASSETS: conditional } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(bakedIn(await res.text()).site, "smores");
  assert.deepStrictEqual(seen, [null], "the asset was fetched with no conditional header");
});

test("site-kit#180: a missing or moved client.js is passed through as it is, not filled or turned into a 500", async () => {
  net();
  for (const status of [404, 301, 503]) {
    const asset = { async fetch() { return new Response("gone", { status, headers: status === 301 ? { Location: "/elsewhere" } : {} }); } };
    const { res } = await call(CLIENT_URL, { env: { ...ENV(d1()), ASSETS: asset } });
    assert.strictEqual(res.status, status);
    assert.strictEqual(await res.text(), "gone");
  }
});

test("site-kit#180: a $ pattern in a settings value is data, never a replacement pattern", () => {
  const src = `before ${SLOT} after ${"$&"}`;                    // a $& in the file itself must survive too
  for (const agent of ["$&", "$1", "$`", "$'", "$$", "a$&b$$c"]) {
    const out = fillSlot(src, { site: "smores", agent, scope: "preview", frame: false });
    const baked = JSON.parse(/^before (.*) after /.exec(out)[1].replaceAll("/*pf-config*/", ""));
    assert.strictEqual(baked.agent, agent, agent);
    assert.ok(out.endsWith(" after $&"), agent);
    assert.ok(!out.includes(SLOT), agent);
  }
});

test("site-kit#156: the edge strips a page's own client tags, before or after </body>, so the page holds only the edge's", async () => {
  net();
  const evil = encodeURIComponent("https://evil.example.com");
  const planted = [
    `<script src="/assets/plugins/preview-feedback/assets/client.js?site=smores&amp;agent=${evil}&amp;scope=preview" type="module"></script>`,
    '<script src="/assets/plugins/preview-feedback/assets/client.js" type="module" data-preview-feedback-site="smores" data-preview-feedback-agent="https://evil.example.com" data-preview-feedback-scope="preview"></script>',
  ];
  const page = () => new Response(`<html><body><h1>Hi</h1>${planted[0]}</body>${planted[1]}</html>`, { headers: { "Content-Type": "text/html" } });
  const html = await (await call("/smores/", { next: page })).res.text();
  const tags = html.match(/<script\b[^>]*preview-feedback[^>]*><\/script>/g) || [];
  assert.strictEqual(tags.length, 1, html);
  assert.strictEqual(tags[0], TAG);
  assert.ok(!html.includes("evil.example.com"), html);
});

test("a pin whose stored selector the browser rejects is skipped and logged; a good one still finds its element (#29)", () => {
  const found = { id: "x" };
  const doc = { querySelector(sel) { if (sel.includes("[[")) throw new SyntaxError("not a valid selector"); return sel === "#x" ? found : null; } };
  const warned = [];
  const warn = console.warn;
  console.warn = (...a) => warned.push(a);
  try {
    assert.deepEqual(pinTarget("main > [[bad", doc), { ok: false, target: null });
    assert.equal(warned.length, 1);
    assert.deepEqual(pinTarget("#x", doc), { ok: true, target: found });
    assert.deepEqual(pinTarget("#gone", doc), { ok: true, target: null });
    assert.equal(warned.length, 1);
  } finally {
    console.warn = warn;
  }
});


// ---- review links (site-kit#38)

const LIVE_SITE = "https://garagedoorsmores.com";
const LIVE_ENV = () => ({ FEEDBACK_PAGES_PROJECT: "garage-door-smores", FEEDBACK_SITE: "smores", FEEDBACK_AGENT: AGENT, ASSETS: ASSETS() });   // no D1 on production

test("a review link turns the live site's comment code on, for the link and the rest of the visit, with no Referer", async () => {
  net();
  const first = await call(`/smores/?review=${REV}`, { host: LIVE_SITE, env: LIVE_ENV() });
  assert.ok((await first.res.text()).includes(TAG));
  // The client a live page loads is the live one, even on the link's first page, before the pf_review cookie is set.
  assert.strictEqual(bakedIn(await (await call(CLIENT_URL, { host: LIVE_SITE, env: LIVE_ENV() })).res.text()).live, true);
  assert.strictEqual(first.res.headers.get("Referrer-Policy"), "no-referrer");
  const later = await call("/about/", { host: LIVE_SITE, env: LIVE_ENV(), cookie: "a=1; pf_review=1" });
  assert.ok((await later.res.text()).includes(TAG));
  assert.strictEqual(later.res.headers.get("Referrer-Policy"), null, "no token in this URL, so no override");
  assert.match(later.res.headers.get("Vary") || "", /Cookie/, "a cache must not mix the reviewing copy with a visitor's");
  // A preview's ?review= page gets the header too.
  assert.strictEqual((await call(`/smores/?review=${REV}`)).res.headers.get("Referrer-Policy"), "no-referrer");
});

test("a live pin from a review link becomes an idea job with its screenshot, and nothing is kept on the site", async () => {
  const calls = net();
  const { res } = await call("/__feedback/pins", {
    host: LIVE_SITE, env: LIVE_ENV(), method: "POST", auth: `Review ${REV}`, name: "Blair", origin: LIVE_SITE,
    body: { ...GOOD, shot: PNG },
  });
  assert.strictEqual(res.status, 201);
  const out = await res.json();
  assert.deepStrictEqual([out.posted, out.job, out.why], [true, "42", null]);
  assert.strictEqual(out.pin.author, "Blair");
  const sent = calls.find((c) => c.url === `${AGENT}/sites/smores/review-idea`);
  assert.strictEqual(sent.init.headers.Authorization, `Review ${REV}`);
  assert.deepStrictEqual(JSON.parse(sent.init.body), {
    name: "Blair", page: `${LIVE_SITE}/smores/`, selector: GOOD.selector, text: "", note: GOOD.note, shot: PNG,
  });
  // Nothing to list on the live site: its pins are jobs on the board.
  const listed = await (await call("/__feedback/pins", { host: LIVE_SITE, env: LIVE_ENV(), auth: `Review ${REV}` })).res.json();
  assert.deepStrictEqual(listed.pins, []);
});

test("an expired or revoked link says the review link has ended; another site's link is refused", async () => {
  const db = d1();
  for (const [host, env] of [[LIVE_SITE, LIVE_ENV()], [PREVIEW, ENV(db)]]) {
    net();
    for (const method of ["GET", "POST"]) {
      const ended = (await call("/__feedback/pins", { host, env, method, auth: `Review ${ENDED}`, name: "Blair", origin: host, body: method === "POST" ? GOOD : undefined })).res;
      assert.strictEqual(ended.status, 410, `${host} ${method}`);
      assert.strictEqual((await ended.json()).error, "this review link has ended");
      const other = (await call("/__feedback/pins", { host, env, method, auth: `Review ${OTHER_SITE}`, name: "Blair", origin: host, body: method === "POST" ? GOOD : undefined })).res;
      assert.strictEqual(other.status, 403, `${host} ${method}`);
      const unknown = (await call("/__feedback/pins", { host, env, method, auth: `Review ${"u".repeat(43)}`, name: "Blair", origin: host, body: method === "POST" ? GOOD : undefined })).res;
      assert.strictEqual(unknown.status, 401, `${host} ${method}`);
    }
  }
  assert.deepStrictEqual(pins(db), [], "nothing kept for a refused link");
});

test("a review link on a preview puts the pin on that branch's PR, under the typed name", async () => {
  const calls = net();
  const db = d1();
  const { res } = await call("/__feedback/pins", { db, method: "POST", auth: `Review ${REV}`, name: "Blair", origin: PREVIEW, body: GOOD });
  assert.strictEqual(res.status, 201);
  assert.strictEqual((await res.json()).posted, true);
  const sent = calls.find((c) => c.url === `${AGENT}/sites/smores/comment`);
  assert.strictEqual(sent.init.headers.Authorization, `Review ${REV}`);
  const body = JSON.parse(sent.init.body);
  assert.strictEqual(body.name, "Blair");
  assert.doesNotMatch(body.body, /Blair/, "the agent names the reviewer; the body doesn't repeat it");
  assert.deepStrictEqual(pins(db).map((p) => [p.alias, p.author]), [[ALIAS, "Blair"]]);
});

test("a review-link pin needs a typed name, kept as plain text", async () => {
  net();
  const db = d1();
  const res = (await call("/__feedback/pins", { db, method: "POST", auth: `Review ${REV}`, origin: PREVIEW, body: GOOD })).res;
  assert.strictEqual(res.status, 400);
  assert.strictEqual((await res.json()).error, "type your name first");
  assert.deepStrictEqual(pins(db), []);
  const emoji = (await call("/__feedback/pins", { db, method: "POST", auth: `Review ${REV}`, name: "🍫🔥", origin: PREVIEW, body: GOOD })).res;
  assert.strictEqual(emoji.status, 400, "a name needs a letter, as the agent requires");
  assert.deepStrictEqual(pins(db), []);
  const req = (n) => new Request(PREVIEW, { headers: { "X-Review-Name": n } });
  assert.strictEqual(reviewName(req(encodeURIComponent("  Ann\u0007 Lee "))), "Ann Lee");
  assert.strictEqual(reviewName(req("%E0%A4%A")), "");    // not decodable
  assert.strictEqual(reviewName(req(encodeURIComponent("x".repeat(200)))).length, 80);
  // site-kit#91: lookalike @ signs fold to "@", and format characters (bidi marks, zero-width) are dropped from the kept name.
  assert.strictEqual(reviewName(req(encodeURIComponent("ann\uFF20example.com"))), "ann@example.com");
  assert.strictEqual(reviewName(req(encodeURIComponent("\u202EAnn\u200B Lee\u200F"))), "Ann Lee");
});

test("site-kit#67: a review-link pin is marked as one wherever it is kept and listed; a signed-in pin is not, and the body can't say otherwise", async () => {
  net();
  const db = d1();
  // A review-link holder claims not to be one, and a signed-in person claims to be one: the server decides, not the body.
  await call("/__feedback/pins", { db, method: "POST", auth: `Review ${REV}`, name: "Blair", origin: PREVIEW, body: { ...GOOD, review: false } });
  await call("/__feedback/pins", { db, method: "POST", token: SETH, origin: PREVIEW, body: { ...GOOD, note: "Seth's own note.", review: true } });
  const marked = db.sql.prepare("SELECT p.author FROM feedback_pins p JOIN feedback_review_pins r ON r.id = p.id").all().map((r) => r.author);
  assert.deepStrictEqual(marked, ["Blair"]);
  const listed = await (await call(`/__feedback/pins?path=${encodeURIComponent(GOOD.path)}`, { db, token: SETH })).res.json();
  assert.deepStrictEqual(listed.pins.map((x) => [x.author, x.review]), [["Blair", true], ["Seth", false]]);
  assert.deepStrictEqual(listed.pins.map(byline), ["Blair (review link)", "Seth"]);
});

test("site-kit#67: a review-link pin and its mark are kept together: if the mark can't be written, no pin is kept to read as signed-in", async () => {
  net();
  const db = d1();
  db.sql.exec("DROP TABLE feedback_review_pins");   // the mark's insert will throw
  const failed = await call("/__feedback/pins", { db, method: "POST", auth: `Review ${REV}`, name: "Blair", origin: PREVIEW, body: GOOD }).then(
    (r) => r.res.status, (err) => err);
  assert.ok(failed instanceof Error || failed >= 500, `it failed, not a quiet 201 (${failed})`);
  assert.deepStrictEqual(pins(db), [], "the pin went with its mark");
});

test("site-kit#67: a review link may not sign a pin with an email address; a signed-in author whose name is an email still may", async () => {
  net();
  const db = d1();
  // site-kit#91: the full-width and small @ signs, and an address with a right-to-left mark in it, are refused too.
  for (const name of ["seth@example.test", "Seth @ the shop", "ann\uFF20example.com", "ann\uFE6Bexample.com", "ann\u200F\uFF20example.com"]) {
    const res = (await call("/__feedback/pins", { db, method: "POST", auth: `Review ${REV}`, name, origin: PREVIEW, body: GOOD })).res;
    assert.strictEqual(res.status, 400, name);
    assert.strictEqual((await res.json()).error, "type your name, not an email address");
  }
  assert.deepStrictEqual(pins(db), [], "nothing kept, and nothing sent on");
  const signedIn = (await call("/__feedback/pins", { db, method: "POST", token: "tok-rev-00000000002", origin: PREVIEW, body: GOOD })).res;
  assert.strictEqual(signedIn.status, 201, "the agent vouched for this person, whose name is their address");
});

test("site-agent#91: a review link may not sign a pin with a team member's name; the agent decides, from the name sent on its check", async () => {
  const calls = net();
  const db = d1();
  for (const name of ["Seth", "  SETH ", "seth@example.test"]) {
    const res = (await call("/__feedback/pins", { db, method: "POST", auth: `Review ${REV}`, name, origin: PREVIEW, body: GOOD })).res;
    assert.strictEqual(res.status, 400, name);
    assert.strictEqual((await res.json()).error, name.includes("@") ? "type your name, not an email address" : "type your name, not a team member's");
  }
  assert.deepStrictEqual(pins(db), [], "nothing kept");
  assert.ok(calls.some((c) => c.url === `${AGENT}/sites/smores/review?name=Seth`), "the typed name goes on the review check");
  const blair = (await call("/__feedback/pins", { db, method: "POST", auth: `Review ${REV}`, name: "Blair", origin: PREVIEW, body: GOOD })).res;
  assert.strictEqual(blair.status, 201, "a name that isn't the team's is kept");
  // The live site's review link is checked the same way.
  const live = (await call("/__feedback/pins", { method: "POST", auth: `Review ${REV}`, name: "Seth", origin: LIVE_SITE, host: LIVE_SITE, env: LIVE_ENV(), body: GOOD })).res;
  assert.strictEqual(live.status, 400);
  assert.strictEqual((await live.json()).error, "type your name, not a team member's");
  // A signed-in person is never asked about: the agent vouched for them.
  const signedIn = (await call("/__feedback/pins", { db, method: "POST", token: "tok-seth-0000000001", origin: PREVIEW, body: GOOD })).res;
  assert.strictEqual(signedIn.status, 201);
});

test("site-agent#91: an agent from before name_ok answers without it, and a review-link pin is kept as before", async () => {
  net({ team: null });
  const db = d1();
  const res = (await call("/__feedback/pins", { db, method: "POST", auth: `Review ${REV}`, name: "Seth", origin: PREVIEW, body: GOOD })).res;
  assert.strictEqual(res.status, 201);
});

test("site-kit#67: schema.sql applies again on an existing database, as a site's every deploy does", () => {
  const db = d1();
  db.sql.exec(readFileSync(new URL("schema.sql", PLUGIN), "utf8"));
  assert.ok(db.sql.prepare("SELECT name FROM sqlite_master WHERE name = 'feedback_review_pins'").get());
});

test("the agent being down refuses a review link rather than letting it through", async () => {
  net({ down: true });
  const res = (await call("/__feedback/pins", { host: LIVE_SITE, env: LIVE_ENV(), method: "POST", auth: `Review ${REV}`, name: "Blair", origin: LIVE_SITE, body: GOOD })).res;
  assert.strictEqual(res.status, 401);
});


test("a review link on a preview only comments: it lists no one's pins and resolves nothing", async () => {
  net();
  const db = d1();
  await call("/__feedback/pins", { db, method: "POST", token: SETH, origin: PREVIEW, body: GOOD });
  const [pin] = pins(db);
  const listed = await (await call(`/__feedback/pins?path=${encodeURIComponent(GOOD.path)}`, { db, auth: `Review ${REV}` })).res.json();
  assert.deepStrictEqual(listed.pins, []);
  // Control: the signed-in reviewer still sees it.
  const own = await (await call(`/__feedback/pins?path=${encodeURIComponent(GOOD.path)}`, { db, token: SETH })).res.json();
  assert.strictEqual(own.pins.length, 1);
  const resolve = (await call(`/__feedback/pins/${pin.id}/resolve`, { db, method: "POST", auth: `Review ${REV}`, origin: PREVIEW })).res;
  assert.strictEqual(resolve.status, 403);
  assert.strictEqual(pins(db)[0].status, "open");
});

test("resolve needs the page's own Origin, not only a matching one when present", async () => {
  net();
  const db = d1();
  await call("/__feedback/pins", { db, method: "POST", token: SETH, origin: PREVIEW, body: GOOD });
  const [pin] = pins(db);
  assert.strictEqual((await call(`/__feedback/pins/${pin.id}/resolve`, { db, method: "POST", token: SETH })).res.status, 403);
  assert.strictEqual((await call(`/__feedback/pins/${pin.id}/resolve`, { db, method: "POST", token: SETH, origin: PREVIEW })).res.status, 200);
});


test("the client takes a review token from the URL and leaves the rest of the address as it was", () => {
  const t = "A".repeat(42) + "_";
  assert.deepStrictEqual(takeReviewToken(`https://garagedoorsmores.com/smores/?a=1&review=${t}#top`), { token: t, clean: "/smores/?a=1#top" });
  assert.deepStrictEqual(takeReviewToken(`https://garagedoorsmores.com/?review=${t}`), { token: t, clean: "/" });
  // A malformed token still leaves the URL bar, and is not kept.
  assert.deepStrictEqual(takeReviewToken("https://garagedoorsmores.com/?review=short"), { token: null, clean: "/" });
  assert.strictEqual(takeReviewToken("https://garagedoorsmores.com/smores/"), null);
});

// site-agent#67: the agent's comment frame. The agent redeems each ticket once (`tickets`: ticket -> what it holds).
function frameNet(tickets) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) !== `${AGENT}/sites/smores/ticket`) return new Response("unexpected", { status: 500 });
    const { ticket } = JSON.parse(init.body);
    const held = tickets[ticket];
    delete tickets[ticket];
    return held ? new Response(JSON.stringify(held)) : new Response("{}", { status: 410 });
  };
  return calls;
}
const FRAME_ENV = (db) => ({ ...ENV(db), FEEDBACK_COMMENT_FRAME: "1" });
const TK = "t".repeat(43), TK2 = "u".repeat(43);
const PIN_TICKET = { kind: "pin", name: "Seth", alias: ALIAS, url: "https://github.com/o/r/pull/7#issuecomment-9", pin: GOOD };

test("site-agent#67: with the frame on, a pin ticket from the agent's origin records the pin the agent posted, taken from the ticket, once", async () => {
  const db = d1();
  const calls = frameNet({ [TK]: PIN_TICKET });
  const pre = await call("/__feedback/pins", { db, env: FRAME_ENV(db), method: "OPTIONS", origin: AGENT });
  assert.strictEqual(pre.res.status, 204);
  assert.strictEqual(pre.res.headers.get("Access-Control-Allow-Origin"), AGENT);
  assert.match(pre.res.headers.get("Access-Control-Allow-Headers"), /Authorization/);
  // site-kit#155: a ticket from the old constant's origin is someone else's now
  assert.strictEqual((await call("/__feedback/pins", { db, env: FRAME_ENV(db), method: "POST", origin: OLD_AGENT, auth: `Ticket ${TK}`, body: {} })).res.status, 403);
  const { res } = await call("/__feedback/pins", { db, env: FRAME_ENV(db), method: "POST", origin: AGENT, auth: `Ticket ${TK}`, body: { ...GOOD, note: "a different note in the body" } });
  assert.strictEqual(res.status, 201);
  assert.strictEqual(res.headers.get("Access-Control-Allow-Origin"), AGENT);
  const [row] = pins(db);
  assert.strictEqual(row.note, GOOD.note, "the note comes from the ticket, never the request");
  assert.strictEqual(row.author, "Seth");
  assert.strictEqual(row.comment_url, PIN_TICKET.url);
  assert.strictEqual(row.shot, null);
  assert.deepStrictEqual(calls.map((c) => c.url), [`${AGENT}/sites/smores/ticket`]);
  assert.strictEqual(JSON.parse(calls[0].init.body).ticket, TK);
  const again = await call("/__feedback/pins", { db, env: FRAME_ENV(db), method: "POST", origin: AGENT, auth: `Ticket ${TK}`, body: {} });
  assert.strictEqual(again.res.status, 401, "a ticket works once");
  assert.strictEqual(pins(db).length, 1);
});

test("site-agent#67: a ticket is refused from any other origin, for another preview, or for another kind; a list ticket lists this page's open pins", async () => {
  const db = d1();
  frameNet({ [TK]: PIN_TICKET, [TK2]: { ...PIN_TICKET, alias: "another-branch" }, ["l".repeat(43)]: { kind: "list", name: "Seth", alias: ALIAS }, ["p".repeat(43)]: { kind: "list", name: "Seth", alias: ALIAS } });
  assert.strictEqual((await call("/__feedback/pins", { db, env: FRAME_ENV(db), method: "POST", origin: PREVIEW, auth: `Ticket ${TK}`, body: {} })).res.status, 403, "the page itself can't spend a ticket");
  assert.strictEqual((await call("/__feedback/pins", { db, env: FRAME_ENV(db), method: "POST", origin: AGENT, auth: `Ticket ${TK2}`, body: {} })).res.status, 403, "another preview's ticket");
  assert.strictEqual((await call("/__feedback/pins", { db, env: FRAME_ENV(db), method: "POST", origin: AGENT, auth: `Ticket ${"l".repeat(43)}`, body: {} })).res.status, 400, "a list ticket records nothing");
  assert.strictEqual(pins(db).length, 0);
  await call("/__feedback/pins", { db, env: FRAME_ENV(db), method: "POST", origin: AGENT, auth: `Ticket ${TK}`, body: {} });
  const list = await call(`/__feedback/pins?path=${encodeURIComponent(GOOD.path)}`, { db, env: FRAME_ENV(db), origin: AGENT, auth: `Ticket ${"p".repeat(43)}` });
  assert.strictEqual(list.res.status, 200);
  const out = await list.res.json();
  assert.deepStrictEqual(out.pins.map((p) => p.note), [GOOD.note]);
});

test("site-agent#67: with the frame off, a ticket is not a way in, and the page gets no frame flag", async () => {
  const db = d1();
  const calls = frameNet({ [TK]: PIN_TICKET });
  const { res } = await call("/__feedback/pins", { db, method: "POST", origin: AGENT, auth: `Ticket ${TK}`, body: GOOD });
  assert.strictEqual(res.status, 401);
  assert.strictEqual(calls.length, 0, "the agent is never asked to redeem it");
  assert.strictEqual(bakedIn(await (await call(CLIENT_URL, { db })).res.text()).framed, false);
  assert.strictEqual(bakedIn(await (await call(CLIENT_URL, { db, env: FRAME_ENV(db) })).res.text()).framed, true);
});

test("site-agent#67: the page takes the frame's word only from the open frame's window and the agent's origin", () => {
  const win = {};
  assert.deepStrictEqual(frameMessage({ source: win, origin: AGENT, data: { type: "pf-posted", url: "u" } }, win, AGENT), { type: "pf-posted", url: "u" });
  assert.strictEqual(frameMessage({ source: {}, origin: AGENT, data: { type: "pf-posted" } }, win, AGENT), null, "another window");
  assert.strictEqual(frameMessage({ source: win, origin: PREVIEW, data: { type: "pf-posted" } }, win, AGENT), null, "another origin");
  assert.strictEqual(frameMessage({ source: win, origin: AGENT, data: "pf-posted" }, win, AGENT), null, "not a message object");
  assert.strictEqual(frameMessage({ source: win, origin: AGENT, data: { type: "pf-posted" } }, null, AGENT), null, "no frame open");
});

test("site-agent#67: pins listed by the frame are drawn only for this page, and only well-formed ones", () => {
  const pin = { id: "a", selector: "main > h1:nth-of-type(1)", x: 1, y: 2, note: "n", author: "Seth" };
  assert.deepStrictEqual(framePins({ type: "pf-pins", path: "/about/", pins: [pin, null, { selector: 7 }] }, "/about/"), [pin]);
  assert.strictEqual(framePins({ type: "pf-pins", path: "/other/", pins: [pin] }, "/about/"), null, "another page's list");
  assert.strictEqual(framePins({ type: "pf-pins", path: "/about/", pins: "x" }, "/about/"), null);
  assert.strictEqual(framePins({ type: "pf-posted", path: "/about/", pins: [pin] }, "/about/"), null);
  assert.strictEqual(framePins(null, "/about/"), null, "nothing from a window that is not the lister");
});

test("site-agent#67: a resolve ticket at /pins/resolve resolves the pin it names, once, for this preview only", async () => {
  const db = d1();
  frameNet({ [TK]: PIN_TICKET });
  await call("/__feedback/pins", { db, env: FRAME_ENV(db), method: "POST", origin: AGENT, auth: `Ticket ${TK}`, body: {} });
  const [{ id }] = pins(db);
  const R1 = "a".repeat(43), R2 = "b".repeat(43), R3 = "c".repeat(43);
  frameNet({ [R1]: { kind: "resolve", name: "Seth", alias: "another-branch", pin: { id } }, [R2]: { kind: "list", name: "Seth", alias: ALIAS }, [R3]: { kind: "resolve", name: "Seth", alias: ALIAS, pin: { id } } });
  assert.strictEqual((await call("/__feedback/pins/resolve", { db, env: FRAME_ENV(db), method: "POST", origin: AGENT, auth: `Ticket ${R1}` })).res.status, 403, "another preview's ticket");
  assert.strictEqual((await call("/__feedback/pins/resolve", { db, env: FRAME_ENV(db), method: "POST", origin: AGENT, auth: `Ticket ${R2}` })).res.status, 400, "a list ticket resolves nothing");
  assert.strictEqual(pins(db)[0].status, "open");
  const ok = await call("/__feedback/pins/resolve", { db, env: FRAME_ENV(db), method: "POST", origin: AGENT, auth: `Ticket ${R3}` });
  assert.strictEqual(ok.res.status, 200);
  assert.strictEqual(ok.res.headers.get("Access-Control-Allow-Origin"), AGENT);
  const [row] = pins(db);
  assert.strictEqual(row.status, "resolved");
  assert.strictEqual(row.resolved_by, "Seth");
});

test("site-agent#259 (0.12.0): in the studio a click reports only the element and its box: no note, nothing to read back", () => {
  globalThis.document = { querySelectorAll: () => [], body: null };
  globalThis.CSS = { escape: (s) => s };
  const target = { nodeType: 1, id: "headline", tagName: "H1", textContent: "  Campfire\n\n  S'mores  ", parentElement: null, previousElementSibling: null,
    getBoundingClientRect: () => ({ left: 10.4, top: 20.6, width: 300.2, height: 40 }) };
  globalThis.document.querySelectorAll = (q) => (q === "#headline" ? [target] : []);
  const { site, ...rest } = studioPoint(target, 3, 4, "/about/", 390, 844);
  assert.deepStrictEqual(rest, { type: "pf-studio-point", path: "/about/", selector: "#headline", text: "Campfire S'mores", x: 3, y: 4, vw: 390, vh: 844,
    box: { left: 10, top: 21, width: 300, height: 40 } });
  assert.strictEqual(typeof site, "string");
  assert.ok(!("note" in rest), "the frame says where, never what to do");
  // It goes to the window that greeted, at that greeting's origin, never "*" (mi-dev-2 on site-kit#576).
  const sent = [];
  const studio = { win: { postMessage: (m, origin) => sent.push([m.type, origin]) }, origin: "https://agent.smores.example" };
  postNote(studio, studioPoint(target, 3, 4, "/about/", 390, 844));
  assert.deepStrictEqual(sent, [["pf-studio-point", "https://agent.smores.example"]]);
  delete globalThis.document;
});

test("site-agent#259: one Feedback everywhere: the studio's old pointing button and its message are gone", () => {
  const src = readFileSync(new URL("../assets/client.js", import.meta.url), "utf8");
  for (const gone of ["Point at something", "pf-studio-pin", "toStudio"]) assert.ok(!src.includes(gone), gone);
  assert.match(src, /if \(studio && !review\) askStudio\(\.\.\.at\);/, "a click in the studio opens the same card");
  assert.match(src, /postNote\(studio, studioPoint\(target, x, y\)\);/, "a click in the studio reports the point through postNote");
  // 0.12.0 (the lead's CHANGE on site-agent#269): in the studio the frame opens no card, sends no note and takes nothing back.
  const ask = src.slice(src.indexOf("function askStudio("), src.indexOf("}", src.indexOf("function askStudio(")) + 1);
  assert.ok(!/noteCard|textarea|card\(/.test(ask), "no card or text box in the frame in the studio");
  for (const gone of ["pf-studio-note", "pf-studio-reply", "acceptReply"]) assert.ok(!src.includes(gone), gone);
  // The card takes at most 2000 characters, the same cap the Studio keeps (dev-2 on site-kit#576).
  assert.match(src, /box\.maxLength = 2000;/, "the note card caps the note at 2000");
});

test("site-kit#25: the frame gets the clicked element's words, squeezed and capped, beside where it is", () => {
  globalThis.document = { querySelectorAll: () => [], body: null };
  globalThis.CSS = { escape: (s) => s };
  const target = { nodeType: 1, id: "headline", tagName: "H1", textContent: "  Campfire\n\n  S'mores  ", parentElement: null, previousElementSibling: null };
  globalThis.document.querySelectorAll = (q) => (q === "#headline" ? [target] : []);
  const ctx = frameContext(target, 3, 4, "/about/", 390, 844);
  assert.deepStrictEqual(ctx, { path: "/about/", selector: "#headline", text: "Campfire S'mores", x: 3, y: 4, vw: 390, vh: 844 });
  assert.strictEqual(frameContext({ ...target, textContent: "x".repeat(1000) }, 0, 0, "/", 1, 1).text.length, TEXT_CAP);
  // An HTML element's words are what is shown (innerText), not hidden text or a <script>'s source (textContent).
  const shown = { ...target, innerText: "Campfire S'mores", textContent: "Campfire S'mores hidden {json:1}" };
  assert.strictEqual(frameContext(shown, 0, 0, "/", 1, 1).text, "Campfire S'mores");
  delete globalThis.document;
  delete globalThis.CSS;
});

// site-agent#117 (Seth: "theres no way to close these if you want to do something else"): Esc closes an open card; a
// click outside it closes an empty one, keeps one with a note typed in it, and asks the agent's frame, which alone sees
// its note; a click inside the card or on the bar is the card's own. Cancel and the × call the same close.
test("site-agent#117: Esc closes, a click away closes only an empty card, and the frame is asked about its own", () => {
  const at = (o) => ({ open: true, framed: false, typed: false, inCard: false, inBar: false, ...o });
  const esc = { type: "keydown", key: "Escape" }, click = { type: "click" };
  assert.strictEqual(closeOn(esc, at({})), "close");
  // site-agent#119: Esc keeps a typed note as a click away does, and asks the frame about its own
  assert.strictEqual(closeOn(esc, at({ typed: true })), "keep", "Esc keeps a typed note");
  assert.strictEqual(closeOn(esc, at({ framed: true })), "away", "Esc asks the frame");
  assert.strictEqual(closeOn(esc, at({ inCard: true, typed: true })), "keep", "Esc inside the card keeps it too");
  assert.strictEqual(closeOn({ type: "keydown", key: "a" }, at({})), null);
  assert.strictEqual(closeOn(click, at({})), "close", "click away, empty");
  assert.strictEqual(closeOn(click, at({ typed: true })), "keep", "click away keeps a typed note");
  assert.strictEqual(closeOn(click, at({ framed: true })), "away", "the frame decides");
  assert.strictEqual(closeOn(click, at({ inCard: true })), null);
  assert.strictEqual(closeOn(click, at({ inBar: true })), null);
  assert.strictEqual(closeOn(esc, at({ open: false })), null, "nothing open");
  const src = readFileSync(new URL("assets/client.js", PLUGIN), "utf8");
  assert.match(src, /x\.addEventListener\("click", closeCard\)/, "the × closes");
  assert.match(src, /cancel\.addEventListener\("click", closeCard\)/, "Cancel closes");
  assert.match(src, /if \(d\.type === "pf-cancelled"\) closeCard\(\);/, "the frame's Cancel and Esc close");
  assert.match(src, /function closeCard\(\) \{\n  closeFrame\(\);\n  ui\.card\?\.remove\(\);\n  ui\.card = null;\n  if \(commenting\) toggle\(\);/, "closing ends comment mode");
});

test("site-agent#117: the frame's box takes the frame's height, within the window, so its top line is never cut", () => {
  assert.strictEqual(frameHeight(260, 900), 260);
  assert.strictEqual(frameHeight(2000, 700), 700 - 68 - 40);
  assert.strictEqual(frameHeight(10, 900), 120);
  assert.strictEqual(frameHeight("x", 900), null);
});

// site-agent#119: a pin list that lands after a card opened redraws only the markers, never the card (it was wiping it).
test("site-agent#119: redrawing the pins removes only the markers, so an open card survives a late pin list", () => {
  const src = readFileSync(new URL("assets/client.js", PLUGIN), "utf8");
  assert.doesNotMatch(src, /ui\.layer\.textContent = ""/, "nothing clears the whole layer");
  assert.match(src, /const clearMarkers = \(\) => ui\.layer\.querySelectorAll\("button\[data-pin\]"\)\.forEach\(\(b\) => b\.remove\(\)\);/);
  assert.match(src, /m\.dataset\.pin = String\(pin\.id \|\| ""\);/, "every marker carries data-pin, so clearMarkers finds it");
});

// site-kit#265: the frame's design read on fartranker (superintelligentfoo#619) failed on placement 4/10: the card opened on
// the clicked heading and on "Continue Reading". Now it opens beside what was clicked, or as a sheet on a phone.
test("site-kit#265: on a wide screen the frame's card never covers the element that was clicked", () => {
  const view = { vw: 1440, vh: 900, sx: 0, sy: 0 };
  const w = 280, h = 340;
  const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  const rects = [
    { left: 695, right: 1307, top: 480, bottom: 580 },   // the hero heading the read opened a card on
    { left: 695, right: 839, top: 695, bottom: 723 },    // "Continue Reading"
    { left: 40, right: 400, top: 100, bottom: 160 },     // left edge: the card goes right
    { left: 1100, right: 1430, top: 300, bottom: 340 },  // right edge: the card goes left
    { left: 10, right: 1430, top: 120, bottom: 200 },    // full width, near the top: the card goes below
    { left: 10, right: 1430, top: 600, bottom: 760 },    // full width, low: the card goes above
  ];
  for (const r of rects) {
    const s = cardSpot(r, view);
    assert.ok(!s.sheet);
    const card = { left: s.left, right: s.left + w, top: s.top, bottom: s.top + h };
    assert.ok(!overlaps(card, r), `card ${JSON.stringify(card)} covers ${JSON.stringify(r)}`);
    assert.ok(card.left >= 0 && card.right <= 1440 - 20, "the card stays on screen");
  }
  // mkt-dev's read: which side, and the bar's clearance, pinned too.
  const edge = cardSpot({ left: 1100, right: 1430, top: 300, bottom: 340 }, view);
  assert.equal(edge.left, 1100 - 8 - w, "no room on the right: the card is on the left, 8px off the element");
  const low = cardSpot({ left: 40, right: 400, top: 820, bottom: 880 }, view);
  assert.ok(low.top + h <= 900 - 68, "beside a low element, the card still ends above the bar");
  const scrolled = cardSpot({ left: 40, right: 400, top: 100, bottom: 160 }, { ...view, sx: 0, sy: 2000 });
  assert.equal(scrolled.top, 2100, "page coordinates, so a scrolled page places it beside the element too");
});

test("site-kit#265: on a phone the card is a bottom sheet; the bar sits bottom right in the site's font; no orange default", () => {
  assert.deepEqual(cardSpot({ left: 20, right: 370, top: 500, bottom: 600 }, { vw: 390, vh: 844, sx: 0, sy: 0 }), { sheet: true });
  assert.equal(PHONE, 600);
  assert.ok(CLIENT_SRC.includes('position: "fixed", left: "8px", right: "8px", width: "auto", top: "auto", bottom: `${BAR_CLEAR}px`'), "the sheet");
  assert.match(CLIENT_SRC, /if \(spot\.sheet\) \{\n\s*frame\.sheetFor = target;\n\s*keepInView\(\);/, "the clicked element is scrolled into view above the sheet (0.10.6: to the middle, site-kit#296)");
  assert.match(CLIENT_SRC, /ui\.bar = el\("div", \{ position: "fixed", right: "var\(--pf-bar-right, 12px\)", bottom: "12px",[^}]*fontFamily: T\.font/,
    "a site can move the bar left of another fixed button (mkt-dev on #266: Talk's bubble)");
  assert.doesNotMatch(CLIENT_SRC, /ui\.bar = el\("div", \{[^}]*left: "12px"/);
  assert.doesNotMatch(CLIENT_SRC, /system-ui, sans-serif" \}\);/, "the bar no longer forces the system font");
  assert.doesNotMatch(CLIENT_SRC, /#d9480f/, "a site that sets no --pf-accent gets a neutral ink, not orange");
});

// superintelligentfoo#619's second design read: the "Click anywhere" hint stayed up over an open card, and with a frame that
// never loaded, Esc and a click away did nothing (both are handed to the frame, which closes itself).
test("0.10.1: an open card hides the hint; Esc and a click away close a card whose frame never answered", () => {
  const card = CLIENT_SRC.slice(CLIENT_SRC.indexOf("function card("), CLIENT_SRC.indexOf("function button("));
  assert.ok(card.includes("ui.status.hidden = true;"), "opening a card hides the hint pill");
  const onFrame = CLIENT_SRC.slice(CLIENT_SRC.indexOf("function onFrame("), CLIENT_SRC.indexOf("function askName("));
  assert.ok(onFrame.indexOf("frame.alive = true;") > onFrame.indexOf("if (!d) return;"), "only a message from the open frame marks it alive");
  assert.ok(CLIENT_SRC.includes("framed: Boolean(frame && frame.card === ui.card && frame.alive)"), "a silent frame is not asked");
  // with framed false, closeOn decides as for a card of the page's own: an empty one closes on Esc and a click away
  const esc = { type: "keydown", key: "Escape" }, away = { type: "click" };
  const silent = { open: true, framed: false, typed: false, inCard: false, inBar: false };
  assert.equal(closeOn(esc, silent), "close");
  assert.equal(closeOn(away, silent), "close");
  assert.equal(closeOn(esc, { ...silent, framed: true }), "away", "a frame that answered still decides for itself");
});

// superintelligentfoo#619's third design read: placement 7 (on a phone the hint sat over "Continue Reading" and caught taps)
// and look 7 (the frame in the system font, a 2px grey border, the × in a band of its own).
test("0.10.2: the hint lets taps through and leaves a phone; a soft card; the × in its corner; the page's font to the frame", () => {
  const statusLine = CLIENT_SRC.split("\n").find((l) => l.includes('ui.status = el("span"'));
  assert.ok(statusLine.includes('pointerEvents: "none"'), "a tap on the hint reaches the page");
  const toggle = CLIENT_SRC.slice(CLIENT_SRC.indexOf("function toggle("), CLIENT_SRC.indexOf("\n}\n", CLIENT_SRC.indexOf("function toggle(")));
  assert.ok(toggle.includes("if (commenting && innerWidth < PHONE) setTimeout("), "on a phone the hint is timed out");
  assert.ok(toggle.includes("ui.status.textContent === hint"), "only the hint it showed, never a later status line");
  assert.ok(HINT_MS >= 3000 && HINT_MS <= 6000);
  const card = CLIENT_SRC.slice(CLIENT_SRC.indexOf("function card("), CLIENT_SRC.indexOf("function button("));
  assert.ok(card.includes("border: `1px solid ${T.line}`") && !card.includes("2px solid"), "one thin line, not a heavy box");
  assert.ok(card.includes("borderRadius: T.radius"), "corners follow --pf-radius");
  const ask = CLIENT_SRC.slice(CLIENT_SRC.indexOf("function askInFrame("), CLIENT_SRC.indexOf("// What the frame says back"));
  assert.ok(ask.includes('Object.assign(c.firstChild.style, { position: "absolute", top: "4px", right: "4px"'), "the frame card's × is in its corner");
  assert.match(CLIENT_SRC, /return \{ type: "pf-hello", font: s\.fontFamily\.slice\(0, 200\),/,
    "the frame is told the page's font, capped");
});

// superintelligentfoo#619's fourth read: beside "Continue Reading" the card sat on the headline (placement 6), the bar behind
// the phone hint caught taps, and the hint was bare text that said "Click" on a phone.
test("0.10.3: of the spots that fit, the card takes the one covering the least text; only the bar's button catches taps", () => {
  const view = { vw: 1440, vh: 900, sx: 0, sy: 0 };
  const cta = { left: 695, right: 839, top: 695, bottom: 723 };   // "Continue Reading", as the read measured it
  const spots = cardCandidates(cta, view);
  assert.ok(spots.length >= 2, "right and left both fit");
  assert.deepEqual(spots[0], cardSpot(cta, view), "cardSpot is still the first choice");
  // The read's page: the headline and excerpt on the right of x 695, the image on the left. A cover that counts that.
  const headline = { left: 695, right: 1340, top: 480, bottom: 680 };
  const cover = (s) => (s.left < headline.right && headline.left < s.left + 280 && s.top < headline.bottom && headline.top < s.top + 340 ? 9 : 0);
  const picked = pickSpot(spots, cover);
  assert.equal(picked.left, 695 - 8 - 280, "left of the button, over the image, not on the headline");
  assert.equal(pickSpot(spots, () => 0), spots[0], "when nothing is covered, the order decides");
  assert.deepEqual(pickSpot([{ sheet: true }], () => 99), { sheet: true }, "a phone keeps its sheet");
  assert.match(CLIENT_SRC, /let spot = pickSpot\(cardCandidates\(r\), \(s\) => textCover\(s\)\);/);
  const barLine = CLIENT_SRC.split("\n").find((l) => l.includes('ui.bar = el("div"'));
  assert.ok(barLine.includes('pointerEvents: "none"'), "the bar lets taps through");
  assert.ok(CLIENT_SRC.includes('ui.button = el("button", { pointerEvents: "auto",'), "only its button catches them");
  const statusLine = CLIENT_SRC.split("\n").find((l) => l.includes('ui.status = el("span"'));
  assert.ok(statusLine.includes('border: `1px solid ${T.line}`') && statusLine.includes('borderRadius: "999px"'), "the hint is a chip");
  assert.ok(CLIENT_SRC.includes('matchMedia("(pointer: coarse)").matches ? "Tap" : "Click"'), "Tap on a touch screen");
  assert.ok(CLIENT_SRC.includes("const s = getComputedStyle(document.body);") && CLIENT_SRC.includes("ink: s.color"), "the frame is told the page's text color");
});

// superintelligentfoo#619, foo's first read (look 6): the frame wore the agent's brown, not Foo's yellow and ink.
test("0.10.4: pf-hello carries the site's own --pf-* colours, only the ones it sets", () => {
  const style = (o) => ({ getPropertyValue: (k) => o[k] ?? "" });
  assert.deepEqual(pfColours(style({ "--pf-accent": " #ffc61a", "--pf-on-accent": "#1b1b2f", "--pf-line": "#1b1b2f", "--pf-bg": "#fff" })),
    { accent: "#ffc61a", onAccent: "#1b1b2f", line: "#1b1b2f", bg: "#fff" });
  assert.deepEqual(pfColours(style({})), {}, "a site that sets none sends none, so the frame keeps its brand");
  assert.deepEqual(pfColours(style({ "--pf-accent": "#" + "a".repeat(80) })), { accent: "#" + "a".repeat(39) }, "capped");
  assert.match(CLIENT_SRC, /type: "pf-hello", font: [^\n]*ink: s\.color, \.\.\.pfColours\(s\) \};/,
    "the frame's hello carries them, read from the page");
});

// The lead on #619: pfColours reads exactly these four, so adding a fifth (a font, say) is a decision a test sees.
test("0.10.5: pfColours reads exactly the four --pf-* colours", () => {
  const read = [];
  pfColours({ getPropertyValue: (k) => { read.push(k); return ""; } });
  assert.deepEqual(read, ["--pf-accent", "--pf-on-accent", "--pf-line", "--pf-bg"]);
});

// #619, foo's read (clarity): a tap on a box of buttons read "See a day with it Read the questions".
test("0.10.5: a box with no words of its own is labelled by its children, joined with a dot", () => {
  const el = (text, kids = [], own = "") => ({ innerText: [own, ...kids.map((k) => k.innerText)].filter(Boolean).join(" "), children: kids,
    childNodes: [...(own ? [{ nodeType: 3, textContent: own }] : []), ...kids.map(() => ({ nodeType: 1 }))], ...(text ? { innerText: text } : {}) });
  const box = el(null, [el("See a day with it"), el("Read the questions")]);
  // Real markup has whitespace between the buttons: a text node of spaces is not words of its own (maint-review-2 on #271).
  box.childNodes = [box.childNodes[0], { nodeType: 3, textContent: "\n    " }, box.childNodes[1]];
  assert.equal(labelFor(box), "See a day with it · Read the questions");
  assert.equal(labelFor(el("Your websites deserve someone who remembers them.")), "Your websites deserve someone who remembers them.", "a plain element reads as itself");
  assert.equal(labelFor(el(null, [el("one"), el("two")], "Words of its own")), "Words of its own one two", "words of its own: read as a whole");
  assert.equal(labelFor(el(null, [el("only child")])), "only child", "one child: no dot");
  assert.equal(labelFor(el(null, [el("  a  \n b "), el(""), el("c")])), "a b · c", "spaces collapse, empty children drop");
  assert.equal(frameContext(box, 1, 2, "/", 390, 844).text, "See a day with it · Read the questions", "the frame is told the joined label");
});

const AG = "https://agent.example.com";
test("0.10.6 (site-kit#296): a CSP report is the agent's frame refused only for a frame directive and the agent itself", () => {
  const v = (effectiveDirective, blockedURI) => ({ effectiveDirective, blockedURI });
  assert.equal(frameBlocked(v("frame-src", `${AG}/comment-frame?site=x`), AG), true);
  assert.equal(frameBlocked(v("default-src", AG), AG), true, "no frame-src, so default-src refused it (Trenz)");
  assert.equal(frameBlocked(v("child-src", `${AG}/`), AG), true);
  assert.equal(frameBlocked(v("script-src", `${AG}/x.js`), AG), false, "not a frame");
  assert.equal(frameBlocked(v("frame-src", "https://agent.example.com.evil.test/"), AG), false, "a look-alike host");
  assert.equal(frameBlocked(v("frame-src", "https://other.example/"), AG), false);
  assert.equal(frameBlocked({ violatedDirective: "frame-src https://x", blockedURI: AG }, AG), true, "older browsers name violatedDirective");
  assert.equal(frameBlocked(v("frame-src", AG), ""), false, "no agent configured");
  assert.equal(frameBlocked(null, AG), false);
});

test("0.10.6: an empty card says why, in words, for a blocked frame and for one that never answered", () => {
  assert.match(frameTrouble("blocked"), /security settings block the comment frame/);
  assert.match(frameTrouble("blocked"), /frame-src/);
  assert.match(frameTrouble("silent"), /didn't answer/);
  assert.ok(FRAME_WAIT_MS >= 5000 && FRAME_WAIT_MS <= 15000, "long enough for a slow frame, short enough to say so");
  assert.match(CLIENT_SRC, /frame\.wait = setTimeout\(\(\) => \{ if \(frame\?\.el === f\) frameFailed\("silent"\); \}, FRAME_WAIT_MS\)/);
  assert.match(CLIENT_SRC, /addEventListener\("securitypolicyviolation", \(e\) => \{ if \(frameBlocked\(e\)\) frameFailed\("blocked"\); \}\)/);
  assert.match(CLIENT_SRC, /if \(frame\.failed\) return;[^\n]*\n\s*frame\.alive = true;/, "a failed card ignores a late answer");
  assert.match(CLIENT_SRC, /frame\.el\.replaceWith\(say\);\n\s*keepInView\(\);/, "the words take the frame's place, and the shorter sheet re-centres the element");
});

test("0.10.6: on a phone the sheet scrolls the clicked element to the middle of the window above it", () => {
  // Trenz at 390x844: "Meet the crew" (59px tall) at the top, the sheet's top at 462px.
  const r = (top, height) => ({ top, height, bottom: top + height });
  assert.equal(sheetScroll(r(16, 59), 462), Math.round(16 - (16 + (462 - 32 - 59) / 2)), "moved down to the middle, not left at the top");
  assert.equal(sheetScroll(r(600, 40), 462), Math.round(600 - (16 + (462 - 32 - 40) / 2)), "an element under the sheet comes up into view");
  assert.equal(sheetScroll(r(900, 500), 462), 900 - 16, "taller than the room: its top at the gap");
  assert.equal(sheetScroll(r(16 + (462 - 32 - 59) / 2 + 5, 59), 462), 0, "a few pixels off: left where it is");
  assert.match(CLIENT_SRC, /if \(h\) frame\.el\.style\.height = `\$\{h\}px`;\n\s*keepInView\(\);/, "again when the frame sets its height");
});

// The third Trenz read (mkt-dev, 03:22Z): the room showed as a black strip under a white footer.
test("0.10.7: the page keeps room at its end for the bar, in the colour of its last section", () => {
  assert.equal(footColour("rgb(255, 255, 255)"), "rgb(255, 255, 255)");
  assert.equal(footColour("rgba(0, 0, 0, 0)"), "", "a transparent section adds no colour");
  assert.equal(footColour("transparent"), "");
  assert.equal(footColour(undefined), "");
  assert.equal(footColour("rgba(10, 20, 30, 0.5)"), "rgba(10, 20, 30, 0.5)");
  assert.ok(CLIENT_SRC.includes("ui.foot = el(\"div\", { height: `${BAR_CLEAR}px`, background: footColour(last && getComputedStyle(last).backgroundColor) });"));
  assert.ok(CLIENT_SRC.includes("document.body.append(ui.foot, ui.layer, ui.bar);"), "after the page's content, in its flow");
  assert.ok(!CLIENT_SRC.includes("style.paddingBottom"), "no body padding left");
  const pad = CLIENT_SRC.slice(CLIENT_SRC.indexOf("const padBy"), CLIENT_SRC.indexOf("function liftPage("));
  assert.ok(pad.includes("ui.foot.style.height"), "a lift grows the same spacer");
});

test("0.10.7: on a phone the sheet's scroll gets the room it lacks, so a footer link at the page's end clears the sheet", () => {
  const keep = CLIENT_SRC.slice(CLIENT_SRC.indexOf("function keepInView("), CLIENT_SRC.indexOf("// #619's fourth read"));
  assert.ok(keep.includes("if (by) liftPage(by);"), "through liftPage, which pads the page's foot");
  assert.ok(!keep.includes("scrollBy("));
});

test("0.10.7: a card says it is loading until its frame first answers, never an empty box", () => {
  const open = CLIENT_SRC.slice(CLIENT_SRC.indexOf("function openFrame("), CLIENT_SRC.indexOf("// site-kit#265"));
  assert.ok(open.includes('height: "0"'), "the frame takes no room before it answers");
  assert.ok(open.includes('"Loading comments…"') && open.includes("c.append(wait, f);"));
  const on = CLIENT_SRC.slice(CLIENT_SRC.indexOf("function onFrame("), CLIENT_SRC.indexOf("if (d.type === \"pf-cancelled\")"));
  assert.ok(/if \(frame\.waitLine\) \{[^}]*frame\.waitLine\.remove\(\);\s*frame\.waitLine = null;\s*frame\.el\.style\.height = "300px";/.test(on), "its first word replaces the line");
  const failed = CLIENT_SRC.slice(CLIENT_SRC.indexOf("function frameFailed("), CLIENT_SRC.indexOf("// The agent's frame in card c"));
  assert.ok(failed.includes("frame.waitLine?.remove();"), "and a failure replaces it with the reason");
});

test("0.10.6: in comment mode a tap anywhere, a footer link included, stays on the page (checked on Trenz, site-kit#296)", () => {
  // The listener runs in the capture phase, before the link's own default, and stops the navigation; only the bar and the
  // plugin's own layer are let through. Closing a card ends comment mode (site-agent#117), so the next tap is ordinary.
  assert.match(CLIENT_SRC, /document\.addEventListener\("click", \(e\) => \{\n\s*if \(closer\(e\)\) return;\n\s*if \(!commenting \|\| ui\.bar\.contains\(e\.target\) \|\| ui\.layer\.contains\(e\.target\)\) return;\n\s*e\.preventDefault\(\);\n\s*e\.stopPropagation\(\);[\s\S]*?\}, true\);/);
});

// site-kit#296, mkt-dev's re-read on Trenz (02:42Z): at 1280 on Contact, a footer link's card covered the address line and
// the Call button above it, because a link that low leaves no spot beside it that is clear of words.
test("0.10.6: an element too low for a card beside it is lifted, and the page gets room it lacks until the card closes", () => {
  const fades = { top: 711, bottom: 755 };   // the re-read's footer link, in an 800px window
  assert.equal(liftFor(fades, { vh: 800 }), 711 - (800 - 68 - 340), "lifted until the card fits beside it, above the bar");
  assert.equal(liftFor({ top: 392 }, { vh: 800 }), 0, "one that already fits stays put");
  assert.equal(liftFor({ top: 100 }, { vh: 800 }), 0);
  assert.equal(liftFor({ top: 300 }, { vh: 400 }), 0, "a window too short for any card: no lift");
  const ask = CLIENT_SRC.slice(CLIENT_SRC.indexOf("function askInFrame("), CLIENT_SRC.indexOf("// What the frame says back"));
  assert.ok(/const by = spot\.sheet \? 0 : liftFor\(r\);\n\s*if \(by && textCover\(spot\)\) \{\s*\/\/[^\n]*\n\s*liftPage\(by\);\n\s*r = target\.getBoundingClientRect\(\);\n\s*spot = pickSpot\(cardCandidates\(r\)/.test(ask),
    "only when the best spot still covers words, never on a phone; then the spots are measured again");
  const lift = CLIENT_SRC.slice(CLIENT_SRC.indexOf("function liftPage("), CLIENT_SRC.indexOf("function keepInView("));
  assert.ok(lift.includes("document.documentElement.scrollHeight - innerHeight") && lift.includes("liftPad += short"), "the foot of the page gets the room it lacks");
  const close = CLIENT_SRC.slice(CLIENT_SRC.indexOf("function closeCard("), CLIENT_SRC.indexOf("// What a key or a click does"));
  assert.ok(close.includes("unlift();"), "and gives it back when the card closes");
});

test("0.10.6: the hidden list frame is greeted with the page's font, ink and colours, as the card's frame is", () => {
  const list = CLIENT_SRC.slice(CLIENT_SRC.indexOf("function listInFrame("), CLIENT_SRC.indexOf("// The pins the frame listed"));
  assert.ok(list.includes("lister.win.postMessage(hello(), AGENT);"), "the lister");
  const open = CLIENT_SRC.slice(CLIENT_SRC.indexOf("function openFrame("), CLIENT_SRC.indexOf("// site-kit#265"));
  assert.ok(open.includes("frame.win.postMessage(hello(), AGENT);"), "the card's frame");
  assert.ok(!/type: "pf-hello" \}/.test(CLIENT_SRC), "no bare hello is left");
});

// site-kit#296, mkt-dev's fourth Trenz read (03:57Z): a tap on the footer gave the card the heading "Sign in to leave a
// note on 'TRENZ Barbershop · About SERVICES FADES Visit CONTACT DIRECT…'".
test("0.10.8: a long label names its landmark, else its heading, else its start; a short one reads as itself", () => {
  // A box with no words of its own: its children's words are joined (the read's FOOTER.wp-block-group).
  const node = (text, { inside = null, heading = null } = {}) => {
    const kids = text.split(" · ").map((k) => ({ innerText: k }));
    return {
      innerText: text.replace(/ · /g, " "), children: kids, childNodes: kids.map(() => ({ nodeType: 1 })),
      closest: (sel) => (inside && sel.split(", ").some((s) => s === inside) ? {} : null),
      querySelector: () => (heading ? { innerText: heading } : null),
    };
  };
  // An element with words of its own (a <p>), wherever it sits.
  const para = (text, inside) => ({ innerText: text, children: [], childNodes: [{ nodeType: 3, textContent: text }],
    closest: (sel) => (sel.split(", ").includes(inside) ? {} : null), querySelector: () => null });
  const footerText = "TRENZ Barbershop · About SERVICES FADES · Visit CONTACT DIRECTIONS and more links here";
  assert.ok(footerText.length > LABEL_CAP);
  assert.equal(shortLabel(node(footerText, { inside: "footer" })), "the footer");
  assert.equal(shortLabel(node(footerText, { inside: "[role=contentinfo]" })), "the footer");
  assert.equal(shortLabel(node(footerText, { inside: "nav" })), "the menu");
  assert.equal(shortLabel(node(footerText, { inside: "header" })), "the header");
  assert.equal(shortLabel(para("FADES", "footer")), "FADES", "one link in the footer reads as itself");
  const address = "© 2026 TRENZ Barbershop · 123 Main Street, Salt Lake City, Utah 84101";
  assert.ok(address.length > LABEL_CAP);
  assert.equal(shortLabel(para(address, "footer")), address, "an address line in the footer keeps its words (dev-2 on #300)");
  assert.equal(shortLabel(para("Classic cuts, hot towel shaves and beard trims in the heart of downtown", "header")),
    "Classic cuts, hot towel shaves and beard trims in the heart of downtown", "and a tagline in the header");
  assert.equal(shortLabel(node("x".repeat(45) + " · " + "y".repeat(45), { heading: "Our hours" })), "Our hours", "a box: else its first heading");
  assert.equal(shortLabel(para("word ".repeat(30).trim())), "word ".repeat(30).trim(), "a long paragraph keeps its words (site-kit#25)");
  assert.equal(frameContext(node(footerText, { inside: "footer" }), 1, 2, "/", 1280, 800).text, "the footer", "the frame is told the short label");
});

// mi-dev-2's surviving mutants on site-kit#299: closing gives back exactly the room a lift added, and the spacer's colour
// never comes from a fixed or absolute element (the bar, a cookie banner) sitting last in <body>.
test("0.10.8: closing gives back the lift's room; the spacer's colour skips fixed and absolute elements", () => {
  const un = CLIENT_SRC.slice(CLIENT_SRC.indexOf("function unlift("), CLIENT_SRC.indexOf("function keepInView("));
  assert.ok(/if \(liftPad\) padBy\(-liftPad\);\s*liftPad = 0;/.test(un), "the spacer shrinks by what was added, then the count resets");
  const last = CLIENT_SRC.slice(CLIENT_SRC.indexOf("function lastSection("), CLIENT_SRC.indexOf("function ask("));
  assert.ok(last.includes('!["fixed", "absolute"].includes(getComputedStyle(e).position)'), "fixed and absolute are skipped");
  assert.ok(last.includes('getComputedStyle(e).display !== "none"') && last.includes(".reverse()"), "the last one shown in the flow");
});

test("site-agent#259 (security read on #682): the client never stores a session", () => {
  const src = readFileSync(new URL("../assets/client.js", import.meta.url), "utf8");
  assert.doesNotMatch(src, /store\.set\(\s*["']pf-session/, "no session in sessionStorage");
  assert.doesNotMatch(src, /localStorage/, "nothing in localStorage");
});

test("site-kit#689: a saved note closes its card and ends comment mode; a refused one keeps both, and says why", async () => {
  const run = async (api, live) => {
    const seen = { closed: 0, marked: [], said: [], sent: null };
    const ok = await savePin("Warmer.", { path: "/", selector: "main h1", text: "Desserts from Around the World", x: 1, y: 2, vw: 390, vh: 844 }, null, live, {
      api: async (p, init) => { seen.sent = { p, body: JSON.parse(init.body) }; return api(); },
      closeCard: () => { seen.closed += 1; },
      mark: (pin) => seen.marked.push(pin),
      status: (s) => seen.said.push(s),
    });
    return { ok, ...seen };
  };
  const saved = await run(async () => ({ pin: { id: "p1" }, posted: true, job: "27966543" }), true);
  assert.deepStrictEqual([saved.ok, saved.closed, saved.marked, saved.said], [true, 1, [{ id: "p1" }], ["Sent to the team as job 27966543. Thank you."]]);
  assert.strictEqual(saved.sent.p, "pins");
  assert.deepStrictEqual(saved.sent.body, { path: "/", selector: "main h1", text: "Desserts from Around the World", x: 1, y: 2, vw: 390, vh: 844, note: "Warmer.", shot: null });
  const refused = await run(async () => { throw new Error("send it from the page itself"); }, true);
  assert.deepStrictEqual([refused.ok, refused.closed, refused.marked, refused.said], [false, 0, [], ["Not saved: send it from the page itself"]]);
  const preview = await run(async () => ({ pin: { id: "p2" }, posted: false, why: "no single open pull request" }), false);
  assert.deepStrictEqual([preview.closed, preview.said], [1, ["Saved here, not posted: no single open pull request."]]);
  // The page wires it: ask() saves through savePin with the clicked element's frameContext.
  const src = readFileSync(new URL("../assets/client.js", import.meta.url), "utf8");
  assert.match(src, /function ask\([^]*?return savePin\(note, frameContext\(target, x, y\), shot, LIVE, \{\s*api, closeCard, status,/);
});

test("site-agent#302: a blocked popup signs in in the same tab and comes back to this page with a one-time code", async () => {
  // The popup's sign-in carries no way back; only the same-tab one does, with this tab's nonce.
  assert.strictEqual(signInUrl("https://agent.example", "smores", "https://garagedoorsmores.com/recipes/baklava/?preview=true#x"),
    "https://agent.example/comment-sign-in?site=smores&origin=https%3A%2F%2Fgaragedoorsmores.com");
  assert.strictEqual(signInUrl("https://agent.example", "smores", "https://garagedoorsmores.com/recipes/baklava/?preview=true#x", "n".repeat(43)),
    `https://agent.example/comment-sign-in?site=smores&origin=https%3A%2F%2Fgaragedoorsmores.com&return=%2Frecipes%2Fbaklava%2F%3Fpreview%3Dtrue&nonce=${"n".repeat(43)}`);
  // The nonce: 43 URL-safe characters, new each time.
  const a = newNonce();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notStrictEqual(newNonce(), a);
  const code = "c".repeat(43);
  assert.deepStrictEqual(takeCode(`https://garagedoorsmores.com/recipes/?preview=true#pf-code=${code}`), { code, clean: "https://garagedoorsmores.com/recipes/?preview=true" });
  // A path that starts // stays a whole URL on this origin, so replaceState can't throw and leave the code in the bar.
  assert.strictEqual(takeCode(`https://garagedoorsmores.com//x?a=1#pf-code=${code}`).clean, "https://garagedoorsmores.com//x?a=1");
  for (const href of ["https://garagedoorsmores.com/", "https://garagedoorsmores.com/#pf-code=short", "https://garagedoorsmores.com/#steps",
    `https://garagedoorsmores.com/#pf-code=${code}&x=1`, `https://garagedoorsmores.com/#pf-code=${"c".repeat(201)}`, "https://garagedoorsmores.com/#pf-code=a<b>cdefghijklmnopq"]) {
    assert.strictEqual(takeCode(href), null, href);
  }
  // The swap: a session on 200, nothing on a refusal, a bad body, a network failure, or no kept nonce (nothing is sent).
  const sent = [];
  const ok = (status, body) => async (b) => { sent.push(JSON.parse(b)); return new Response(JSON.stringify(body), { status }); };
  const nonce = "n".repeat(43);
  assert.deepStrictEqual(await swapCode(code, nonce, ok(200, { token: "t", expires: "x" })), { token: "t", expires: "x" });
  assert.deepStrictEqual(sent[0], { code, nonce }, "the code goes with this page's nonce");
  assert.strictEqual(await swapCode(code, nonce, ok(401, { error: "sign in again" })), null);
  assert.strictEqual(await swapCode(code, nonce, ok(200, { token: "" })), null);
  assert.strictEqual(await swapCode(code, nonce, async () => { throw new TypeError("offline"); }), null);
  const before = sent.length;
  assert.strictEqual(await swapCode(code, "", ok(200, { token: "t", expires: "x" })), null, "a page that kept no nonce");
  assert.strictEqual(sent.length, before, "nothing sent without a nonce");
  // The page wires it: a blocked popup goes in this tab; the address is cleaned before the swap, and Feedback opens.
  const src = readFileSync(new URL("../assets/client.js", import.meta.url), "utf8");
  assert.match(src, /if \(window\.open\(signInUrl\(AGENT, SITE, location\.href\), "preview-feedback-sign-in", "width=480,height=640"\)\) return status\([^)]*\);\n  const nonce = newNonce\(\);\n  store\.set\("pf-nonce", nonce\);\n  location\.assign\(signInUrl\(AGENT, SITE, location\.href, nonce\)\);/);
  assert.match(src, /const nonce = store\.get\("pf-nonce"\) \|\| "";\n  store\.drop\("pf-nonce"\);/);
  assert.match(src, /const back = !review && !FRAMED \? takeCode\(location\.href\) : null;\n  if \(back\) \{\n    history\.replaceState\(history\.state, "", back\.clean\);\n    swapCode\(back\.code, takeNonce\(\)\)/);
  assert.match(src, /session = s;[^]*?if \(!commenting\) toggle\(\);/);
});

test("site-agent#302: the edge swaps a code for this page only, and anything but a fresh session is 'sign in again'", async () => {
  const calls = net();
  const host = LIVE_SITE;
  const send = (body, origin = host) => call("/__feedback/code", { host, method: "POST", origin, body, env: LIVE_ENV() });
  const nonce = "n".repeat(43);
  const good = await send({ code: "c".repeat(43), nonce });
  assert.strictEqual(good.res.status, 200);
  assert.deepStrictEqual(await good.res.json(), { token: "tok-code-0000000009", expires: "2026-11-25T03:00:00Z" });
  const sent = calls.find((c) => c.url === `${AGENT}/sites/smores/comment-code`);
  assert.deepStrictEqual(JSON.parse(sent.init.body), { code: "c".repeat(43), nonce, origin: host }, "the agent is told this page's own origin and nonce");
  assert.strictEqual((await send({ code: "x".repeat(43), nonce })).res.status, 401, "a code the agent refuses");
  assert.strictEqual((await send({ code: "c".repeat(43), nonce: "x".repeat(43) })).res.status, 401, "another page's nonce");
  assert.strictEqual((await send({ code: "c".repeat(43), nonce }, "https://evil.example")).res.status, 403, "another origin can't ask");
  assert.strictEqual((await send({})).res.status, 400);
  assert.strictEqual((await send({ code: "c".repeat(43) })).res.status, 400, "no nonce");
  assert.strictEqual((await send({ code: "c".repeat(201), nonce })).res.status, 400, "at most 200 characters");
  assert.strictEqual((await send({ code: "c".repeat(43), nonce: "n".repeat(201) })).res.status, 400, "a nonce of at most 200");
  const before = calls.length;
  assert.strictEqual((await call("/__feedback/code", { host, method: "GET", origin: host, env: LIVE_ENV() })).res.status, 405);
  assert.strictEqual(calls.length, before, "nothing sent to the agent for a GET");
});

test("site-agent#302 (Fable on site-kit#699): the button a load starts with; a live ?preview=true visit and a live review link keep it", () => {
  const signIn = { text: "Sign in to comment", hidden: false, exit: false };
  assert.deepStrictEqual(startState({}), signIn, "a preview: sign in");
  assert.deepStrictEqual(startState({ live: true, previewing: true }), { text: "Sign in to comment", hidden: false, exit: true }, "live with ?preview=true: sign in, and the exit");
  assert.deepStrictEqual(startState({ live: true, previewing: true, signedIn: true }), { text: "Feedback", hidden: false, exit: true });
  assert.deepStrictEqual(startState({ live: true, review: true }), { text: "Feedback", hidden: false, exit: false }, "a live review link");
  assert.deepStrictEqual(startState({ review: true }), { text: "Feedback", hidden: false, exit: false });
  assert.deepStrictEqual(startState({ framed: true }), { text: "Feedback", hidden: false, exit: false });
  assert.deepStrictEqual(startState({ live: true }), { text: "Sign in to comment", hidden: true, exit: false }, "live, not opened: nothing to comment with");
});

test("0.20.1 (the S'mores guard on the v0.96.217 sync): the client makes one network call, send(), and every route goes through it", () => {
  const src = readFileSync(new URL("../assets/client.js", import.meta.url), "utf8");
  assert.deepStrictEqual(src.match(/\bfetch\b/g), ["fetch"], "one fetch in the whole client");
  assert.ok(src.includes('const send = (path, init) => fetch(API + path, { credentials: "same-origin", ...init });'));
  assert.ok(src.includes("const res = await send(path, { ...init, headers });"), "api() sends");
  assert.ok(src.includes('post = (body) => send("code", '), "the code swap sends");
});

test("site-kit#701: a saved live note says its job, only when it is a plain short id", () => {
  assert.strictEqual(sentText({ posted: true, job: "0932ee34" }), "Sent to the team as job 0932ee34. Thank you.");
  for (const job of [null, undefined, "", 42, "a b", "<b>x</b>", "x".repeat(41)]) {
    assert.strictEqual(sentText({ posted: true, job }), "Sent to the team. Thank you.", String(job));
  }
  assert.strictEqual(sentText({ posted: false, why: "this review link has ended" }), "Not sent: this review link has ended.");
});
