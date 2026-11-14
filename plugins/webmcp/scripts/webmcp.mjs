// webmcp (site-kit#330): the build step. After the site's build, it reads the webmcp block of the site's agent config (the
// file discovery.py reads; a Jekyll site's _data/agents.json), writes the page script with the tools inlined to
// <built-dir>/assets/plugins/webmcp/webmcp.js, and adds one script tag before </body> on each page the block names.
//
//   node plugins/webmcp/scripts/webmcp.mjs <built-dir> --config <agents.json> [--offline]
//
//   {"origin": "https://example.com", ...,
//    "webmcp": {"pages": ["/", "/tools/llms-txt/"],
//               "tools": [{"name": "llms_txt", "description": "...", "endpoint": "/api/llms-txt",
//                          "inputSchema": {"type": "object", "properties": {"url": {"type": "string"}}, "required": ["url"]}}]}}
//
// No block, or one with no tools, writes nothing. Anything wrong writes nothing either: one line per problem and exit 1. An
// endpoint is a path on the site's origin or an https address; each is asked with a GET (unless --offline), and only no
// answer, a 404/410 or a server error counts as dead, as in discovery.py: a POST endpoint answering GET with 405 is there.
// Plain Node, no dependencies.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SRC = "/assets/plugins/webmcp/webmcp.js";
export const TAG = `<script type="module" src="${SRC}"></script>`;
const PAGE_SCRIPT = fileURLToPath(new URL("../page/webmcp.js", import.meta.url));
const SLOT = "const TOOLS = [];";
const NAME = /^[A-Za-z0-9_.-]{1,128}$/;   // an MCP tool name
const PAGE = /^\/(?:(?!\.\.?\/)[A-Za-z0-9._~-]+\/)*$/;   // "/" or "/a/b/" (no . or .. segment): a page served as <dir>/a/b/index.html
const BLOCK_KEYS = new Set(["pages", "tools"]);
const TOOL_KEYS = new Set(["name", "description", "inputSchema", "endpoint"]);

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isText = (v) => typeof v === "string" && v.trim() !== "";

// The address a tool's endpoint is fetched at: a path on the origin, or an https address as given; null when it is neither.
export function endpointUrl(endpoint, origin) {
  if (!isText(endpoint)) return null;
  if (endpoint.startsWith("/") && !endpoint.startsWith("//")) return isText(origin) ? origin.replace(/\/+$/, "") + endpoint : null;   // "https://x.com/" + "/api" is not //api (maint-review on #331)
  try { return new URL(endpoint).protocol === "https:" ? endpoint : null; } catch { return null; }
}

// Every problem with a webmcp block; an empty list is a block the build can write. `origin` is the config's own origin.
export function problems(block, origin) {
  if (!isObject(block)) return ["webmcp is an object"];
  const out = [...Object.keys(block)].filter((k) => !BLOCK_KEYS.has(k)).sort().map((k) => `webmcp: unknown key "${k}"`);
  if (!Array.isArray(block.tools)) return [...out, "webmcp.tools is a list"];
  if (!Array.isArray(block.pages) || block.pages.length === 0) out.push("webmcp.pages lists the pages that get the script, like \"/\"");
  else for (const p of block.pages) if (typeof p !== "string" || !PAGE.test(p)) out.push(`webmcp.pages: ${JSON.stringify(p)} is not a page path like "/" or "/tools/x/"`);
  const seen = new Set();
  block.tools.forEach((t, i) => {
    const at = `webmcp.tools[${i}]${isObject(t) && isText(t.name) ? ` (${t.name})` : ""}`;
    if (!isObject(t)) return out.push(`${at} is an object`);
    for (const k of Object.keys(t).filter((k) => !TOOL_KEYS.has(k)).sort()) out.push(`${at}: unknown key "${k}"`);
    if (!isText(t.name)) out.push(`${at} has no name`);
    else if (!NAME.test(t.name)) out.push(`${at}: the name is 1 to 128 letters, digits, _ . or -`);
    else if (seen.has(t.name)) out.push(`${at}: the name is used twice`);
    else seen.add(t.name);
    if (!isText(t.description)) out.push(`${at} has no description`);
    if (!("inputSchema" in t)) out.push(`${at} has no inputSchema`);
    else if (!isObject(t.inputSchema) || t.inputSchema.type !== "object") out.push(`${at}: the inputSchema is a JSON Schema object with "type": "object"`);
    if (!isText(t.endpoint)) out.push(`${at} has no endpoint`);
    else if (!endpointUrl(t.endpoint, origin)) out.push(`${at}: the endpoint is a path on the site's origin (with "origin" set) or an https address`);
  });
  return out;
}

// Why an endpoint can't be listed, or "" when it answers.
export async function dead(url, fetcher = fetch) {
  try {
    const res = await fetcher(url, { method: "GET", headers: { "User-Agent": "site-kit webmcp" }, redirect: "manual", signal: AbortSignal.timeout(10000) });
    return res.status >= 500 || res.status === 404 || res.status === 410 ? `${url} answers ${res.status}` : "";
  } catch (err) {
    return `${url} does not answer (${err?.message ?? err})`;
  }
}

// The page script with the tools inlined: only what registerTool and the fetch need.
export function pageScript(tools) {
  const source = readFileSync(PAGE_SCRIPT, "utf8");
  if (source.split(SLOT).length !== 2) throw new Error(`page/webmcp.js must hold "${SLOT}" exactly once`);
  const list = tools.map(({ name, description, inputSchema, endpoint }) => ({ name, description, inputSchema, endpoint }));
  // A function replacer: a string one would read $&, $' and $` in tool text as replacement patterns (mi-dev-2 on #331).
  return source.replace(SLOT, () => `const TOOLS = ${JSON.stringify(list, null, 2)};`);
}

const pageFile = (dir, page) => path.join(dir, ...page.split("/").filter(Boolean), "index.html");

// {errors, files}: the files to write ({path: text}), or the reasons nothing may be written. Writes nothing itself.
export async function plan(dir, cfg, { offline = false, fetcher = fetch } = {}) {
  const block = isObject(cfg) ? cfg.webmcp : undefined;
  if (block === undefined || (isObject(block) && Array.isArray(block.tools) && block.tools.length === 0)) return { errors: [], files: {} };
  const errors = problems(block, cfg.origin);
  if (errors.length) return { errors, files: {} };
  if (!offline) for (const t of block.tools) { const why = await dead(endpointUrl(t.endpoint, cfg.origin), fetcher); if (why) errors.push(`${t.name}: ${why}`); }
  const files = { [path.join(dir, ...SRC.split("/").filter(Boolean))]: pageScript(block.tools) };
  for (const page of new Set(block.pages)) {
    const f = pageFile(dir, page);
    if (!existsSync(f) || !statSync(f).isFile()) { errors.push(`${page}: no built page at ${path.relative(dir, f)}`); continue; }
    const html = readFileSync(f, "utf8");
    if (html.includes(SRC)) { errors.push(`${page} already has the webmcp script`); continue; }
    const ends = html.match(/<\/body>/gi) ?? [];
    if (ends.length !== 1) { errors.push(`${page} has ${ends.length} </body> tags; the script goes before the one`); continue; }
    const at = html.search(/<\/body>/i);
    files[f] = html.slice(0, at) + TAG + "\n" + html.slice(at);
  }
  return errors.length ? { errors, files: {} } : { errors, files };
}

export async function main(argv, { fetcher = fetch, log = console.log, warn = console.error } = {}) {
  const at = argv.indexOf("--config");
  const config = at >= 0 ? argv[at + 1] : undefined;
  const dir = argv.find((a, i) => !a.startsWith("--") && i !== at + 1);
  if (at < 0 || !config || !dir) { warn("usage: webmcp.mjs <built-dir> --config <agents.json> [--offline]"); return 2; }
  const offline = argv.includes("--offline");
  let cfg;
  try { cfg = JSON.parse(readFileSync(config, "utf8")); } catch (err) { warn(`webmcp: ${config} cannot be read: ${err.message}`); return 1; }
  const { errors, files } = await plan(dir, cfg, { offline, fetcher });
  for (const e of errors) warn(`webmcp: ${e}`);
  if (errors.length) return 1;
  for (const [f, text] of Object.entries(files)) { mkdirSync(path.dirname(f), { recursive: true }); writeFileSync(f, text); }
  const pages = Object.keys(files).length - 1;
  log(pages > 0 ? `webmcp: ${cfg.webmcp.tools.length} tool(s) on ${pages} page(s)` : "webmcp: no tools, nothing written");
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) process.exitCode = await main(process.argv.slice(2));
