// plugins/webmcp (site-kit#330): the build step on built dirs made in a temp folder (nothing written without a block, each
// refusal, the endpoint check, the script tag on each named page), and the page script run headless in Node with a stub
// document.modelContext: it registers exactly the configured tools, execute posts to the endpoint, and with no API it does nothing.
import test, { after } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SRC, TAG, endpointUrl, plan, problems } from "../scripts/webmcp.mjs";

const SCRIPT = fileURLToPath(new URL("../scripts/webmcp.mjs", import.meta.url));
const PAGE_JS = fileURLToPath(new URL("../page/webmcp.js", import.meta.url));
const ORIGIN = "https://example.com";
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

const PAGE = "<!doctype html><html><head><title>x</title></head><body><main>x</main></body></html>";
function site(files = { "index.html": PAGE, "tools/a/index.html": PAGE }) {
  const d = mkdtempSync(path.join(tmpdir(), "webmcp-"));
  dirs.push(d);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(d, rel)), { recursive: true });
    writeFileSync(path.join(d, rel), body);
  }
  return d;
}
const listing = (d) => readdirSync(d, { recursive: true }).sort();
const LLMS = { name: "llms_txt", description: "Write a site's llms.txt", endpoint: "/api/llms-txt",
  inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } };
const AUDIT = { name: "audit", description: "Audit a business", endpoint: "https://api.example.net/audit",
  inputSchema: { type: "object", properties: { city: { type: "string" } } } };
const cfg = (webmcp, extra = {}) => ({ origin: ORIGIN, name: "x", description: "x", ...extra, ...(webmcp === undefined ? {} : { webmcp }) });
const BLOCK = { pages: ["/", "/tools/a/"], tools: [LLMS, AUDIT] };
const answers = (status) => { const asked = []; const f = async (url, init) => { asked.push([url, init.method]); return new Response(null, { status }); }; f.asked = asked; return f; };
const cli = (dir, config, ...flags) => {
  const f = path.join(site({}), "agents.json");
  writeFileSync(f, JSON.stringify(config));
  return spawnSync(process.execPath, [SCRIPT, dir, "--config", f, ...flags], { encoding: "utf8" });
};

test("no webmcp block, or one with no tools, writes nothing", async () => {
  for (const c of [cfg(undefined), cfg({ pages: ["/"], tools: [] }), cfg({ tools: [] })]) {
    const d = site();
    const before = listing(d);
    assert.deepEqual(await plan(d, c, { fetcher: answers(200) }), { errors: [], files: {} });
    const r = cli(d, c);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /nothing written/);
    assert.deepEqual(listing(d), before);
    assert.equal(readFileSync(path.join(d, "index.html"), "utf8"), PAGE);
  }
});

test("each refusal names the tool and what is wrong", () => {
  const without = (k) => { const t = { ...LLMS }; delete t[k]; return t; };
  const cases = [
    [{ pages: ["/"], tools: [without("endpoint")] }, "(llms_txt) has no endpoint"],
    [{ pages: ["/"], tools: [{ ...LLMS, endpoint: "  " }] }, "(llms_txt) has no endpoint"],
    [{ pages: ["/"], tools: [without("name")] }, "webmcp.tools[0] has no name"],
    [{ pages: ["/"], tools: [without("description")] }, "(llms_txt) has no description"],
    [{ pages: ["/"], tools: [without("inputSchema")] }, "(llms_txt) has no inputSchema"],
    [{ pages: ["/"], tools: [{ ...LLMS, inputSchema: "url" }] }, "the inputSchema is a JSON Schema object"],
    [{ pages: ["/"], tools: [{ ...LLMS, inputSchema: [] }] }, "the inputSchema is a JSON Schema object"],
    [{ pages: ["/"], tools: [{ ...LLMS, inputSchema: { type: "string" } }] }, "the inputSchema is a JSON Schema object"],
    [{ pages: ["/"], tools: [{ ...LLMS, endpoint: "http://example.com/api" }] }, "the endpoint is a path on the site's origin"],
    [{ pages: ["/"], tools: [{ ...LLMS, endpoint: "//evil.example/api" }] }, "the endpoint is a path on the site's origin"],
    [{ pages: ["/"], tools: [{ ...LLMS, name: "has space" }] }, "the name is 1 to 128"],
    [{ pages: ["/"], tools: [LLMS, LLMS] }, "the name is used twice"],
    [{ pages: ["/"], tools: [{ ...LLMS, method: "GET" }] }, 'unknown key "method"'],
    [{ pages: ["/"], tools: ["llms_txt"] }, "webmcp.tools[0] is an object"],
    [{ pages: ["/"], tools: {} }, "webmcp.tools is a list"],
    [{ tools: [LLMS] }, "webmcp.pages lists the pages"],
    [{ pages: ["/tools/a"], tools: [LLMS] }, "is not a page path"],
    [{ pages: ["/../x/"], tools: [LLMS] }, "is not a page path"],
    [{ pages: ["/./"], tools: [LLMS] }, "is not a page path"],
    [{ pages: ["/"], tools: [LLMS], extra: 1 }, 'webmcp: unknown key "extra"'],
    [[LLMS], "webmcp is an object"],
  ];
  for (const [block, want] of cases) {
    const got = problems(block, ORIGIN);
    assert.ok(got.some((p) => p.includes(want)), `${JSON.stringify(block)}: want "${want}", got ${JSON.stringify(got)}`);
  }
  assert.ok(problems({ pages: ["/"], tools: [LLMS] }, undefined).some((p) => p.includes("the endpoint is a path on the site's origin")),
    "a path endpoint needs the config's origin");
  assert.deepEqual(problems(BLOCK, ORIGIN), []);
});

test("a refused config writes nothing and exits 1, naming each problem", () => {
  const d = site();
  const before = listing(d);
  const { endpoint, ...noEndpoint } = LLMS;
  const r = cli(d, cfg({ pages: ["/"], tools: [noEndpoint, { ...AUDIT, inputSchema: [] }] }), "--offline");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /webmcp: webmcp\.tools\[0\] \(llms_txt\) has no endpoint/);
  assert.match(r.stderr, /webmcp: webmcp\.tools\[1\] \(audit\): the inputSchema/);
  assert.deepEqual(listing(d), before);
});

test("an endpoint that does not answer, or answers 404, 410 or 5xx, is refused unless --offline", async () => {
  for (const [fetcher, want] of [[answers(404), "answers 404"], [answers(410), "answers 410"], [answers(502), "answers 502"],
    [async () => { throw new Error("getaddrinfo ENOTFOUND"); }, "does not answer (getaddrinfo ENOTFOUND)"]]) {
    const { errors, files } = await plan(site(), cfg(BLOCK), { fetcher });
    assert.deepEqual(files, {});
    assert.ok(errors.includes(`llms_txt: ${ORIGIN}/api/llms-txt ${want}`), JSON.stringify(errors));
  }
  for (const status of [200, 400, 403, 405]) {
    const fetcher = answers(status);
    assert.deepEqual((await plan(site(), cfg(BLOCK), { fetcher })).errors, [], `${status} is an endpoint that is there`);
    assert.deepEqual(fetcher.asked, [[`${ORIGIN}/api/llms-txt`, "GET"], [AUDIT.endpoint, "GET"]]);
  }
  const fetcher = answers(404);
  assert.deepEqual((await plan(site(), cfg(BLOCK), { offline: true, fetcher })).errors, []);
  assert.deepEqual(fetcher.asked, [], "--offline asks nothing");
});

test("a named page that was not built, or has no single </body>, is refused", async () => {
  const off = { offline: true };
  let r = await plan(site({ "index.html": PAGE }), cfg(BLOCK), off);
  assert.deepEqual(r.errors, [`/tools/a/: no built page at ${path.join("tools", "a", "index.html")}`]);
  r = await plan(site({ "index.html": "<p>x</p>", "tools/a/index.html": PAGE + "</body>" }), cfg(BLOCK), off);
  assert.deepEqual(r.errors, ["/ has 0 </body> tags; the script goes before the one", "/tools/a/ has 2 </body> tags; the script goes before the one"]);
  assert.deepEqual(r.files, {});
});

test("the build writes the script and adds one tag before </body> on each named page, and only those", () => {
  const d = site({ "index.html": PAGE, "tools/a/index.html": PAGE.replace("</body>", "</BODY>"), "about/index.html": PAGE });
  const r = cli(d, cfg(BLOCK), "--offline");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), "webmcp: 2 tool(s) on 2 page(s)");
  assert.equal(readFileSync(path.join(d, "index.html"), "utf8"), PAGE.replace("</body>", `${TAG}\n</body>`));
  assert.equal(readFileSync(path.join(d, "tools/a/index.html"), "utf8"), PAGE.replace("</body>", `${TAG}\n</BODY>`));
  assert.equal(readFileSync(path.join(d, "about/index.html"), "utf8"), PAGE);
  const js = readFileSync(path.join(d, SRC), "utf8");
  assert.ok(js.includes('"name": "llms_txt"') && !js.includes("const TOOLS = [];"), "the tools are inlined");
  const again = cli(d, cfg(BLOCK), "--offline");
  assert.equal(again.status, 1);
  assert.match(again.stderr, /\/ already has the webmcp script/);
});

// The page script as the build writes it, run as a browser would load it, with this document and fetch.
async function load(file, document, fetchStub) {
  const saved = { document: globalThis.document, fetch: globalThis.fetch };
  globalThis.document = document;
  globalThis.fetch = fetchStub;
  try {
    await import(`${pathToFileURL(file).href}?run=${Math.random()}`);
  } finally {
    globalThis.document = saved.document;
    globalThis.fetch = saved.fetch;
  }
  return fetchStub;
}
function built() {
  const d = site();
  const r = cli(d, cfg(BLOCK), "--offline");
  assert.equal(r.status, 0, r.stderr);
  return path.join(d, SRC);
}
function stubContext() {
  const registered = [];
  return { registered, modelContext: { registerTool: async (tool, options) => { registered.push({ tool, options }); } } };
}
function recordingFetch(status, text) {
  const calls = [];
  const f = async (url, init) => { calls.push({ url, ...init }); return new Response(text, { status }); };
  f.calls = calls;
  return f;
}

test("headless: the script registers exactly the configured tools", async () => {
  const doc = stubContext();
  await load(built(), doc, recordingFetch(200, "{}"));
  assert.deepEqual(doc.registered.map(({ tool }) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema })),
    [LLMS, AUDIT].map(({ name, description, inputSchema }) => ({ name, description, inputSchema })));
  assert.ok(doc.registered.every(({ tool }) => typeof tool.execute === "function"));
});

test("a path endpoint joins an origin with or without a trailing slash as one address (maint-review on #331)", () => {
  assert.equal(endpointUrl("/api/x", "https://example.com/"), "https://example.com/api/x");
  assert.equal(endpointUrl("/api/x", "https://example.com"), "https://example.com/api/x");
});

test("headless: a $ in tool text is kept as written, never read as a replacement pattern (mi-dev-2 on #331)", async () => {
  const DOLLAR = { name: "dollar", description: "costs $5: a $& b $' c $` d $$ e", endpoint: "https://api.example.net/price$&x",
    inputSchema: { type: "object", properties: { q: { type: "string", description: "a $' quote" } } } };
  const d = site();
  const r = cli(d, cfg({ pages: ["/"], tools: [DOLLAR] }), "--offline");
  assert.equal(r.status, 0, r.stderr);
  const doc = stubContext();
  const fetchStub = await load(path.join(d, SRC), doc, recordingFetch(200, "{}"));
  assert.equal(doc.registered.length, 1);
  const { tool } = doc.registered[0];
  assert.equal(tool.description, DOLLAR.description);
  assert.deepEqual(tool.inputSchema, DOLLAR.inputSchema);
  const globalFetch = globalThis.fetch;
  globalThis.fetch = fetchStub;
  try {
    await tool.execute({ q: "x" });
  } finally {
    globalThis.fetch = globalFetch;
  }
  assert.equal(fetchStub.calls[0].url, DOLLAR.endpoint);
});

test("headless: execute posts the input as JSON to the tool's endpoint and returns the answer as text content", async () => {
  const doc = stubContext();
  const fetchStub = recordingFetch(200, '{"llms":"# Example"}');
  await load(built(), doc, fetchStub);
  const signal = new AbortController().signal;
  const [llms, audit] = doc.registered.map(({ tool }) => tool);
  const globalFetch = globalThis.fetch;
  globalThis.fetch = fetchStub;
  try {
    assert.deepEqual(await llms.execute({ url: "example.org" }, { signal }), { content: [{ type: "text", text: '{"llms":"# Example"}' }] });
    await audit.execute({ city: "St. George" });
  } finally {
    globalThis.fetch = globalFetch;
  }
  assert.deepEqual(fetchStub.calls.map(({ url, method, headers, body }) => ({ url, method, headers, body })), [
    { url: "/api/llms-txt", method: "POST", headers: { "Content-Type": "application/json" }, body: '{"url":"example.org"}' },
    { url: AUDIT.endpoint, method: "POST", headers: { "Content-Type": "application/json" }, body: '{"city":"St. George"}' },
  ]);
  assert.equal(fetchStub.calls[0].signal, signal, "the agent's cancel reaches the request");
});

test("headless: an endpoint error comes back as isError with the endpoint's own message", async () => {
  const doc = stubContext();
  const fetchStub = recordingFetch(400, '{"error":"Please enter a website address."}');
  await load(built(), doc, fetchStub);
  const globalFetch = globalThis.fetch;
  globalThis.fetch = fetchStub;
  try {
    assert.deepEqual(await doc.registered[0].tool.execute({}),
      { content: [{ type: "text", text: '{"error":"Please enter a website address."}' }], isError: true });
  } finally {
    globalThis.fetch = globalFetch;
  }
});

test("headless: no registration and no request where the browser has no WebMCP API", async () => {
  for (const doc of [undefined, {}, { modelContext: undefined }, { modelContext: {} }, { modelContext: { registerTool: "no" } }]) {
    const fetchStub = recordingFetch(200, "{}");
    await load(built(), doc, fetchStub);
    assert.deepEqual(fetchStub.calls, []);
  }
});

test("headless: the unbuilt page script registers nothing", async () => {
  const doc = stubContext();
  await load(PAGE_JS, doc, recordingFetch(200, "{}"));
  assert.deepEqual(doc.registered, []);
});
