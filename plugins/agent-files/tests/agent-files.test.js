// plugins/agent-files (site-kit#114): markdown twins on Accept: text/markdown, the /a2a refusal, the read-only /mcp, and
// the twin builder. The site's assets are a Map standing in for Pages' ASSETS binding.
import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { agentFiles, onRequest, wantsMarkdown, twinPath, vary, sitemapPaths, discoveryHeaders, CATALOG_TYPE, HOME_LINK } from "../functions/agent-files.js";
import { pageToMarkdown, writeTwins } from "../scripts/twins.mjs";

const ORIGIN = "https://example.com";
const FILES = new Map([
  ["/index.md", "# Home\n\nhello\n"],
  ["/about/index.md", "# About\n\nus\n"],
  // Files that look like a twin but are not one: get_page must never reach them.
  ["/robots.txt", "# robots\nUser-agent: *\n"],
  ["/llms.txt", "# Example\n"],
  ["/notes.md", "# private notes\n"],
  ["/sitemap-index.xml", `<sitemapindex><sitemap><loc>${ORIGIN}/sitemap-0.xml</loc></sitemap><sitemap><loc>https://evil.test/s.xml</loc></sitemap></sitemapindex>`],
  ["/sitemap-0.xml", `<urlset><url><loc>${ORIGIN}/about/</loc></url><url><loc>${ORIGIN}/</loc></url><url><loc>https://other.test/x/</loc></url></urlset>`],
]);
// Pages answers a missing file with the 404 page and a 200 on some setups, so a missing twin returns HTML here.
const ASSETS = { fetch: async (u) => {
  if (new URL(u).origin !== ORIGIN) return new Response("# another origin\n");   // would pass for a twin if reached
  const p = new URL(u).pathname;
  return FILES.has(p) ? new Response(FILES.get(p)) : new Response("<!doctype html><h1>Not found</h1>", { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
} };
const ctx = (pathname, init = {}, next = async () => new Response("<html>", { headers: { "Content-Type": "text/html" } })) =>
  ({ request: new Request(ORIGIN + pathname, init), env: { ASSETS }, next });
const rpc = (method, params, id = 1) => ({ method: "POST", body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) });

test("Accept decides markdown: asked for, at least as much as HTML", () => {
  assert.equal(wantsMarkdown("text/markdown"), true);
  assert.equal(wantsMarkdown("text/markdown, text/html;q=0.9"), true);
  assert.equal(wantsMarkdown("text/html,application/xhtml+xml,*/*;q=0.8"), false);   // a browser
  assert.equal(wantsMarkdown("*/*"), false);
  assert.equal(wantsMarkdown("text/html, text/markdown;q=0.5"), false);
  assert.equal(wantsMarkdown("text/markdown;q=0"), false);
  assert.equal(wantsMarkdown(""), false);
});

test("only page paths have twins", () => {
  assert.equal(twinPath("/"), "/index.md");
  assert.equal(twinPath("/about/"), "/about/index.md");
  assert.equal(twinPath("/about"), "/about/index.md");
  for (const p of ["/logo.png", "/.well-known/mcp.json", "/a/../b/", "//evil.test/", "/x?", "/x#", "/\\evil/", "/%2e/", "x/"])
    assert.equal(twinPath(p), null, p);
});

test("a page asked for as markdown gets its twin; a browser gets the site's page, with Vary: Accept", async () => {
  const md = await onRequest(ctx("/about/", { headers: { Accept: "text/markdown" } }));
  assert.equal(md.headers.get("Content-Type"), "text/markdown; charset=utf-8");
  assert.equal(md.headers.get("Vary"), "Accept");
  assert.equal(await md.text(), "# About\n\nus\n");
  const html = await onRequest(ctx("/about/", { headers: { Accept: "text/html" } }));
  assert.equal(await html.text(), "<html>");
  assert.equal(html.headers.get("Vary"), "Accept");
});

test("no twin (or the 404 page in its place) falls through to the site", async () => {
  assert.equal(await agentFiles(ctx("/missing/", { headers: { Accept: "text/markdown" } })), null);
  assert.equal(await agentFiles(ctx("/logo.png", { headers: { Accept: "text/markdown" } })), null);
});

test("vary keeps an existing Vary and adds Accept once", () => {
  assert.equal(vary(new Response("", { headers: { Vary: "Origin" } })).headers.get("Vary"), "Origin, Accept");
  assert.equal(vary(new Response("", { headers: { Vary: "accept" } })).headers.get("Vary"), "accept");
});

test("/a2a refuses plainly, as JSON-RPC to a POST and as text to a GET", async () => {
  const post = await (await agentFiles(ctx("/a2a", rpc("message/send", { message: {} }, 7)))).json();
  assert.equal(post.id, 7);
  assert.equal(post.error.code, -32004);
  assert.match(post.error.message, /no assistant yet/);
  const get = await agentFiles(ctx("/a2a"));
  assert.equal(get.status, 200);
  assert.match(await get.text(), /no assistant yet.*\/mcp/);
  const bad = await (await agentFiles(ctx("/a2a", { method: "POST", body: "{" }))).json();
  assert.equal(bad.error.code, -32700);
});

test("/mcp: initialize, tools/list, and a notification", async () => {
  const init = await (await agentFiles(ctx("/mcp", rpc("initialize", {})))).json();
  assert.equal(init.result.protocolVersion, "2025-06-18");
  assert.equal(init.result.serverInfo.name, "example.com");
  const list = await (await agentFiles(ctx("/mcp", rpc("tools/list")))).json();
  assert.deepEqual(list.result.tools.map((t) => t.name), ["list_pages", "get_page"]);
  const note = await agentFiles(ctx("/mcp", { method: "POST", body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) }));
  assert.equal(note.status, 202);
  assert.equal((await agentFiles(ctx("/mcp"))).status, 405);
});

test("/mcp list_pages reads the sitemap index, same origin only", async () => {
  const r = await (await agentFiles(ctx("/mcp", rpc("tools/call", { name: "list_pages" })))).json();
  assert.equal(r.result.content[0].text, "/\n/about/");
  assert.deepEqual(await sitemapPaths({ env: { ASSETS } }, ORIGIN), ["/", "/about/"]);
  // #114: on www. the bare domain's sitemap still counts as the site's own; a look-alike host never does. Pages serves the
  // same files on every hostname of the project, so here the assets answer whatever host asks.
  const ANY = { fetch: (u) => ASSETS.fetch(ORIGIN + new URL(u).pathname) };
  assert.deepEqual(await sitemapPaths({ env: { ASSETS: ANY } }, "https://www.example.com"), ["/", "/about/"]);
  for (const o of ["https://wwwexample.com", "https://www.example.com.evil.test", "http://example.com", "https://example.com:8443"])
    assert.deepEqual(await sitemapPaths({ env: { ASSETS: ANY } }, o), [], o);
});

test("/mcp get_page returns a twin and refuses anything else", async () => {
  const call = async (args) => (await (await agentFiles(ctx("/mcp", rpc("tools/call", { name: "get_page", arguments: args })))).json()).result;
  assert.equal((await call({ path: "/about/" })).content[0].text, "# About\n\nus\n");
  for (const p of ["/missing/", "about", "//evil.test/", "/../etc/", "/.well-known/mcp.json",
    // game-dev-3 on #115: a query or fragment once reached a non-twin file, and a backslash another origin.
    "/robots.txt?", "/llms.txt#", "/notes.md#x", "/about/?x", "/\\evil.example/", "/%2e%2e/", "/a\tb/", "/about/%0a"])
    assert.equal((await call({ path: p })).isError, true, p);
  // site-kit#197: a page left without a twin (--skip-no-main) may exist, so the miss doesn't say it doesn't
  assert.equal((await call({ path: "/missing/" })).content[0].text, "no markdown version of /missing/. The page may still exist as HTML; list_pages names the site's pages.");
  const unknown = await (await agentFiles(ctx("/mcp", rpc("tools/call", { name: "write_page" })))).json();
  assert.equal(unknown.error.code, -32602);
  const method = await (await agentFiles(ctx("/mcp", rpc("resources/list")))).json();
  assert.equal(method.error.code, -32601);
  const batch = await (await agentFiles(ctx("/mcp", { method: "POST", body: "[]" }))).json();
  assert.equal(batch.error.code, -32600);
  const big = await (await agentFiles(ctx("/mcp", { method: "POST", body: "x".repeat(70000) }))).json();
  assert.equal(big.error.code, -32600);
  // A body that streams past the cap with no Content-Length is cut off, not read whole.
  let pulled = 0;
  const stream = new ReadableStream({ pull(c) { pulled += 1; c.enqueue(new Uint8Array(16 * 1024).fill(120)); } });
  const streamed = await (await agentFiles(ctx("/mcp", { method: "POST", body: stream, duplex: "half" }))).json();
  assert.equal(streamed.error.code, -32600);
  assert.ok(pulled <= 6, `read ${pulled} chunks`);
  const lied = await (await agentFiles(ctx("/mcp", { method: "POST", body: "{}", headers: { "Content-Length": "999999" } }))).json();
  assert.equal(lied.error.code, -32600);
});

// The twin builder, with a stand-in converter: the kit's CI installs no turndown, and the sites run the real one.
const convert = (h) => h.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
const page = (canonical, extra = "") => `<html><head><title>T</title><meta name="description" content="A &amp; B's">
<link rel="canonical" href="${canonical}">${extra}</head><body><main class="x"><h1>Hi <em>there</em></h1><p>Body <a href="/a/">a</a></p></main></body></html>`;

test("pageToMarkdown: h1, address, description, then the main's own words", () => {
  const t = pageToMarkdown(page(`${ORIGIN}/a/`), { origin: ORIGIN, convert: (h) => h });
  assert.equal(t.title, "Hi there");
  assert.ok(t.markdown.startsWith(`# Hi there\n\n${ORIGIN}/a/\n\nA & B's\n\n`));
  assert.match(t.markdown, new RegExp(`href="${ORIGIN}/a/"`));   // relative links made absolute
  assert.doesNotMatch(t.markdown, /<h1/);
});

test("pageToMarkdown: noindex and another site's canonical get none; no <main> is an error", () => {
  assert.equal(pageToMarkdown(page(`${ORIGIN}/a/`, '<meta name="robots" content="noindex">'), { origin: ORIGIN, convert }), null);
  assert.equal(pageToMarkdown(page("https://docs.example.org/a/"), { origin: ORIGIN, convert }), null);
  assert.equal(pageToMarkdown(page("https://example.com.evil.test/"), { origin: ORIGIN, convert }), null);
  assert.throws(() => pageToMarkdown(`<link rel="canonical" href="${ORIGIN}/">`, { origin: ORIGIN, convert }), /no <main>/);
});

test("site-kit#193: a page with no <main> fails the run, or, asked to skip, gets no twin and is named", () => {
  const dist = mkdtempSync(path.join(tmpdir(), "twins-"));
  try {
    mkdirSync(path.join(dist, "game"));
    mkdirSync(path.join(dist, "hidden"));
    writeFileSync(path.join(dist, "index.html"), page(`${ORIGIN}/`));
    writeFileSync(path.join(dist, "game", "index.html"), `<link rel="canonical" href="${ORIGIN}/game/"><body><canvas></canvas></body>`);
    writeFileSync(path.join(dist, "hidden", "index.html"), `<meta name="robots" content="noindex"><link rel="canonical" href="${ORIGIN}/hidden/">`);
    assert.throws(() => writeTwins(dist, { origin: ORIGIN, convert }), /\/game\/: no <main>/);
    const skipped = [];
    const twins = writeTwins(dist, { origin: ORIGIN, convert, skipped });
    assert.deepEqual(twins.map((t) => t.canonical), [`${ORIGIN}/`]);
    assert.deepEqual(skipped, [`${ORIGIN}/game/`]);
    assert.ok(existsSync(path.join(dist, "index.md")));
    assert.ok(!existsSync(path.join(dist, "game", "index.md")));
  } finally { rmSync(dist, { recursive: true }); }
});

test("writeTwins writes index.md beside each page and, when asked, llms-full.txt", () => {
  const dist = mkdtempSync(path.join(tmpdir(), "twins-"));
  try {
    mkdirSync(path.join(dist, "a"));
    writeFileSync(path.join(dist, "index.html"), page(`${ORIGIN}/`));
    writeFileSync(path.join(dist, "a", "index.html"), page(`${ORIGIN}/a/`));
    mkdirSync(path.join(dist, "404"));
    writeFileSync(path.join(dist, "404", "index.html"), page(`${ORIGIN}/404/`, '<meta name="robots" content="noindex, follow">'));
    assert.equal(writeTwins(dist, { origin: ORIGIN, convert }).length, 2);
    assert.ok(existsSync(path.join(dist, "a", "index.md")));
    assert.ok(!existsSync(path.join(dist, "404", "index.md")));
    assert.ok(!existsSync(path.join(dist, "llms-full.txt")));
    writeTwins(dist, { origin: ORIGIN, convert, llmsFull: "Example: every page" });
    assert.match(readFileSync(path.join(dist, "llms-full.txt"), "utf8"), /^# Example: every page[\s\S]*<!-- https:\/\/example.com\/a\/ -->/);
  } finally { rmSync(dist, { recursive: true }); }
});

// site-kit#317: the kit is the host for a template site, so agent-files serves the api-catalog's type and the home Link.
test("the api-catalog is served as a linkset with its own Link, and the home page names it only when it exists", async () => {
  const cat = await onRequest(ctx("/.well-known/api-catalog", {}, async () => new Response('{"linkset":[]}', { headers: { "Content-Type": "application/octet-stream" } })));
  assert.equal(cat.headers.get("Content-Type"), CATALOG_TYPE);
  assert.equal(cat.headers.get("Link"), '</.well-known/api-catalog>; rel="api-catalog"');
  // No catalog among the assets (the HTML 404 page as a 200): the home page gets no Link.
  const bare = await onRequest(ctx("/"));
  assert.equal(bare.headers.get("Link"), null);
  // With one, it names the catalog, the agent card, llms.txt, and ard.json and ai-catalog.json.
  FILES.set("/.well-known/api-catalog", '{"linkset":[]}');
  const withAssets = { fetch: async (u, init) => {
    const r = await ASSETS.fetch(u, init);
    return new URL(u).pathname === "/.well-known/api-catalog" ? new Response(r.body, { headers: { "Content-Type": "application/octet-stream" } }) : r;
  } };
  const home = await onRequest({ ...ctx("/"), env: { ASSETS: withAssets } });
  assert.equal(home.headers.get("Link"), HOME_LINK);
  assert.match(HOME_LINK, /rel="api-catalog"/);
  assert.match(HOME_LINK, /<\/\.well-known\/ai-catalog\.json>; rel="ai-catalog"; type="application\/json"/);
  assert.match(HOME_LINK, /<\/\.well-known\/ard\.json>; rel="ard"; type="application\/json"/);
  FILES.delete("/.well-known/api-catalog");
  // An error answer is passed through untouched.
  const err = await discoveryHeaders(ctx("/.well-known/api-catalog"), new Response("x", { status: 404 }));
  assert.equal(err.headers.get("Link"), null);
});

// herdos#3873: the ARD check reads the AI Catalog, which any origin may fetch.
test("ard.json and ai-catalog.json are each served as JSON that any origin may read, and an error answer is not", async () => {
  for (const p of ["/.well-known/ard.json", "/.well-known/ai-catalog.json"]) {
    const cat = await onRequest(ctx(p, {}, async () => new Response('{"specVersion":"1.0","entries":[]}', { headers: { "Content-Type": "application/octet-stream" } })));
    assert.match(cat.headers.get("Content-Type"), /^application\/json/, p);
    assert.equal(cat.headers.get("Access-Control-Allow-Origin"), "*", p);
    assert.equal(await cat.text(), '{"specVersion":"1.0","entries":[]}');
    const err = await discoveryHeaders(ctx(p), new Response("x", { status: 404 }));
    assert.equal(err.headers.get("Access-Control-Allow-Origin"), null, p);
  }
});
