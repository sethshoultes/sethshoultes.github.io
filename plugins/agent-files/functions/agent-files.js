// agent-files (site-kit plugin; site-kit#114): what an agent reads on a Cloudflare Pages site, per herdos
// docs/standards/public-site.md rules 6 and 7.
//
//   Accept: text/markdown   a page's markdown twin (<page>/index.md, built by scripts/twins.mjs), Vary: Accept
//   /a2a                    the agent card's url: a plain JSON-RPC refusal until the site has chat
//   /mcp                    a read-only MCP (streamable HTTP, JSON answers, no auth): list_pages from the sitemap,
//                           get_page for one twin. Public pages only, fetched from the site's own assets.
//
// A site with no _middleware.js of its own re-exports onRequest. One that has one calls agentFiles(context) first and
// returns its answer when it gives one, then passes its own response through vary(). The site writes its own
// /.well-known/agent-card.json and mcp.json, because its why lives there (rule 8).

export const VERSION = "0.1.1";
export const MCP_PROTOCOL = "2025-06-18";
const MAX_PAGES = 2000;
const MAX_BODY = 64 * 1024;
const JSON_TYPE = "application/json; charset=utf-8";

// q of the first range in Accept that matches `type` (exact, type/*, or */*), the most specific winning; 0 if none.
function quality(accept, type) {
  let best = -1, q = 0;
  for (const part of accept.split(",")) {
    const [range, ...params] = part.trim().toLowerCase().split(";");
    const spec = range === type ? 3 : range === type.split("/")[0] + "/*" ? 2 : range === "*/*" ? 1 : 0;
    if (!spec || spec < best) continue;
    const qp = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    const v = qp ? Number(qp.slice(2)) : 1;
    if (spec > best || v > q) { best = spec; q = Number.isFinite(v) ? v : 0; }
  }
  return q;
}

/** True when the request asks for markdown at least as much as for HTML. */
export function wantsMarkdown(accept) {
  if (!accept) return false;
  const md = quality(accept, "text/markdown");
  return md > 0 && md >= quality(accept, "text/html") && /text\/markdown/i.test(accept);
}

/** The twin's path for a page path, or null for a path that is not a page (an asset, a .well-known file). */
export function twinPath(pathname) {
  // Only a plain path: no query, fragment, backslash, percent-escape or control character can steer it elsewhere.
  if (typeof pathname !== "string" || !pathname.startsWith("/") || /[?#\\%\x00-\x20\x7f]/.test(pathname)) return null;
  if (pathname.includes("..") || pathname.includes("//") || pathname.startsWith("/.well-known/")) return null;
  if (pathname.endsWith("/")) return pathname + "index.md";
  if (/\.[a-z0-9]+$/i.test(pathname.split("/").pop())) return null;
  return pathname + "/index.md";
}

async function twin(context, pathname) {
  const p = twinPath(pathname);
  if (!p) return null;
  const origin = new URL(context.request.url).origin;
  const url = new URL(p, origin);
  if (url.origin !== origin || url.pathname !== p || url.search || url.hash) return null;   // the URL must be exactly the twin
  const res = await context.env.ASSETS.fetch(url);
  if (res.status !== 200) return null;
  // Pages serves a missing file as the 404 page or the SPA index with a 200, so the body must look like a twin.
  const text = await res.text();
  return text.startsWith("# ") ? text : null;
}

/** `res` with Accept added to Vary, so a cache keeps the HTML and the markdown apart. */
export function vary(res) {
  const out = new Response(res.body, res);
  const v = out.headers.get("Vary");
  if (!v || !/(^|,)\s*accept\s*(,|$)/i.test(v)) out.headers.set("Vary", v ? `${v}, Accept` : "Accept");
  return out;
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": JSON_TYPE } });
const rpcError = (id, code, message) => json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

// The body as text, or null once it passes MAX_BODY bytes: refused on Content-Length first, then read with a running
// count and cancelled at the cap, so a large body is never held whole.
async function readCapped(request) {
  if (Number(request.headers.get("Content-Length") || 0) > MAX_BODY) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}

async function readRpc(request) {
  const text = await readCapped(request);
  if (text === null) return { error: [-32600, "the request is too large"] };
  try {
    const msg = JSON.parse(text);
    if (!msg || typeof msg !== "object" || Array.isArray(msg) || msg.jsonrpc !== "2.0" || typeof msg.method !== "string")
      return { error: [-32600, "send one JSON-RPC 2.0 request"] };
    return { msg };
  } catch {
    return { error: [-32700, "the body is not JSON"] };
  }
}

function a2a(request, origin) {
  const words = `This site has no assistant yet. Its pages are at ${origin}/llms.txt, and its read-only MCP is at ${origin}/mcp.`;
  if (request.method !== "POST")
    return new Response(words + "\n", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return readRpc(request).then(({ msg, error }) =>
    error ? rpcError(null, ...error) : rpcError(msg.id, -32004, words));   // -32004: A2A's UnsupportedOperationError
}

/** Same-origin page paths from /sitemap.xml or /sitemap-index.xml (one level of child sitemaps), sorted. */
export async function sitemapPaths(context, origin) {
  const fetchText = async (path) => {
    const r = await context.env.ASSETS.fetch(new URL(path, origin));
    const body = r.status === 200 ? await r.text() : "";
    return /<(urlset|sitemapindex)\b/i.test(body) ? body : "";   // not the 404 page served in its place
  };
  const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  // The site's own address, with or without www. (#114: both sites serve www. without a redirect, and their sitemaps name
  // the bare domain, so www.'s list was empty). Any other host is never listed.
  const bare = (h) => h.replace(/^www\./, "");
  const site = new URL(origin);
  const local = (u) => {
    try {
      const x = new URL(u);
      return x.protocol === site.protocol && x.port === site.port && bare(x.hostname) === bare(site.hostname) ? x.pathname : null;
    } catch { return null; }
  };
  let xml = await fetchText("/sitemap.xml");
  if (!xml) xml = await fetchText("/sitemap-index.xml");
  const pages = new Set();
  const children = /<sitemapindex/i.test(xml) ? locs(xml).map(local).filter(Boolean).slice(0, 50) : [];
  for (const body of children.length ? await Promise.all(children.map(fetchText)) : [xml])
    for (const p of locs(body).map(local)) if (p && pages.size < MAX_PAGES) pages.add(p);
  return [...pages].sort();
}

const TOOLS = [
  { name: "list_pages", description: "List the site's public pages (from its sitemap), one path per line.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true } },
  { name: "get_page", description: "Get one public page as markdown, by its path (for example /about/).",
    inputSchema: { type: "object", properties: { path: { type: "string", description: "The page's path, starting with /" } },
      required: ["path"], additionalProperties: false },
    annotations: { readOnlyHint: true } },
];

async function mcp(context, origin) {
  const { request } = context;
  if (request.method !== "POST")
    return new Response("This is a read-only MCP endpoint: POST JSON-RPC 2.0.\n",
      { status: 405, headers: { Allow: "POST", "Content-Type": "text/plain; charset=utf-8" } });
  const { msg, error } = await readRpc(request);
  if (error) return rpcError(null, ...error);
  if (msg.id === undefined) return new Response(null, { status: 202 });   // a notification, e.g. notifications/initialized
  const ok = (result) => json({ jsonrpc: "2.0", id: msg.id, result });
  const text = (t, isError = false) => ok({ content: [{ type: "text", text: t }], isError });
  switch (msg.method) {
    case "initialize":
      return ok({ protocolVersion: MCP_PROTOCOL, capabilities: { tools: {} },
        serverInfo: { name: new URL(origin).hostname, version: VERSION } });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      const { name, arguments: args = {} } = msg.params || {};
      if (name === "list_pages") return text((await sitemapPaths(context, origin)).join("\n"));
      if (name === "get_page") {
        const path = typeof args.path === "string" ? args.path : "";
        if (!path.startsWith("/")) return text("path must start with /", true);
        const body = await twin(context, path);
        // site-kit#197: a page built with --skip-no-main has no twin, so a miss is "no markdown version", not "no page".
        // The path is echoed as given, never made into a link.
        return body ? text(body) : text(`no markdown version of ${path}. The page may still exist as HTML; list_pages names the site's pages.`, true);
      }
      return rpcError(msg.id, -32602, `unknown tool ${JSON.stringify(name)}`);
    }
    default:
      return rpcError(msg.id, -32601, `unknown method ${JSON.stringify(msg.method)}`);
  }
}

/** The plugin's answer for this request, or null to let the site serve it. */
export async function agentFiles(context) {
  const { request } = context;
  const url = new URL(request.url);
  const origin = url.origin;
  if (url.pathname === "/a2a") return a2a(request, origin);
  if (url.pathname === "/mcp") return mcp(context, origin);
  if ((request.method === "GET" || request.method === "HEAD") && wantsMarkdown(request.headers.get("Accept") || "")) {
    const body = await twin(context, url.pathname);
    if (body !== null)
      return new Response(request.method === "HEAD" ? null : body, { headers: {
        "Content-Type": "text/markdown; charset=utf-8", Vary: "Accept", "X-Robots-Tag": "noindex" } });
  }
  return null;
}

/** functions/_middleware.js for a site with none of its own: `export { onRequest } from "<this file>"`. */
export async function onRequest(context) {
  return (await agentFiles(context)) ?? vary(await context.next());
}
