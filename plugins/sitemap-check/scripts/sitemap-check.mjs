// sitemap-check (site-kit#262): every URL a built site's sitemap lists must be served as listed by Cloudflare Pages, with
// a 200 and no noindex. Pages 308s /a.html and /a/index.html to the clean URL, /a to /a/ when only a/index.html exists, and
// /a/ to /a when only a.html exists; a search engine that meets a redirect or a noindex in a sitemap drops the URL.
//
//   node plugins/sitemap-check/scripts/sitemap-check.mjs <built-dir> --origin https://example.com
//
// It reads <dir>/sitemap.xml, or <dir>/sitemap-index.xml and the child sitemaps it names, and <dir>/_redirects. Plain Node,
// no dependencies, no network. One line per problem ("<url>: <reason>") and exit 1; a one-line count and exit 0.
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const decodeXml = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

// The decoded text of every <loc> in a sitemap or sitemap index.
export const locs = (xml) => [...xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)].map((m) => decodeXml(m[1]));

const isFile = (f) => existsSync(f) && statSync(f).isFile();
const trimSlash = (p) => (p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p);

// A _redirects source as a pattern over a path, a trailing slash either way: * matches any rest of the path (an empty
// one too), :name matches one segment.
export function sourcePattern(source) {
  const re = trimSlash(source).split(/(\/\*|\*|:[A-Za-z_]\w*)/).map((part, i) => (i % 2 === 0
    ? part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    : part === "/*" ? "(?:/.*)?" : part === "*" ? ".*" : "[^/]+")).join("");
  return new RegExp(`^${re}/?$`);
}

// The sources in <dir>/_redirects (first field of each non-comment line) as patterns. A 200 rule is a rewrite, not a
// redirect, so it is left out. Pages takes the first rule that matches; for this check any match is a redirect.
export function redirectRules(dir) {
  const f = path.join(dir, "_redirects");
  if (!isFile(f)) return [];
  return readFileSync(f, "utf8").split("\n").map((l) => l.trim().split(/\s+/)).filter(([src]) => src && !src.startsWith("#"))
    .filter((fields) => fields[2] !== "200").map(([src]) => sourcePattern(src));
}

// True when the page has <meta name="robots"> or <meta name="googlebot"> with a noindex or none directive (a whole
// comma-separated token, so max-image-preview:none is not one), in either attribute order and any case.
export function isNoindex(html) {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = {};
    for (const m of tag.matchAll(/([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi))
      attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4];
    if (/^(robots|googlebot)$/i.test((attrs.name ?? "").trim()) && (attrs.content ?? "").split(",").some((t) => /^(noindex|none)$/i.test(t.trim()))) return true;
  }
  return false;
}

// How Pages serves a decoded path from the built dir: { file } it answers with a 200, or { reason } it does not.
export function resolvePath(dir, p) {
  const root = path.resolve(dir);
  const at = (rel) => {
    const f = path.resolve(root, "." + rel);
    return f.startsWith(root + path.sep) && isFile(f) ? f : null;
  };
  if (p === "/") return at("/index.html") ? { file: at("/index.html") } : { reason: "missing" };
  if (p.endsWith("/")) {
    const a = p.slice(0, -1);
    if (path.posix.basename(a).toLowerCase().endsWith(".html")) return { reason: "redirects to the clean URL" };
    if (at(a + "/index.html")) return { file: at(a + "/index.html") };
    return { reason: at(a + ".html") ? `redirects (Pages serves ${a})` : "missing" };
  }
  const ext = path.posix.extname(path.posix.basename(p)).toLowerCase();
  if (ext === ".html") return { reason: "redirects to the clean URL" };
  if (ext) return at(p) ? { file: at(p) } : { reason: "missing" };
  if (at(p + ".html")) return { file: at(p + ".html") };
  return { reason: at(p + "/index.html") ? `redirects to ${p}/` : "missing" };
}

// The page URLs a built dir's sitemap lists, plus any problem with the sitemaps themselves. null when there is no sitemap.
// sitemap.xml is read first; either file may be a <sitemapindex>, whose same-origin children are read from the dir.
export function sitemapUrls(dir, origin) {
  const own = new URL(origin).origin;
  const file = ["sitemap.xml", "sitemap-index.xml"].map((n) => path.join(dir, n)).find(isFile);
  if (!file) return null;
  const xml = readFileSync(file, "utf8");
  if (!/<sitemapindex\b/i.test(xml)) return { urls: locs(xml), problems: [] };
  const urls = [], problems = [];
  for (const child of locs(xml)) {
    let u, p;
    try { u = new URL(child); p = decodeURIComponent(u.pathname); } catch { problems.push({ url: child, reason: "not a URL" }); continue; }
    if (u.origin !== own) { problems.push({ url: child, reason: "other origin" }); continue; }
    const f = resolvePath(dir, p);
    if (!f.file) { problems.push({ url: child, reason: f.reason }); continue; }
    urls.push(...locs(readFileSync(f.file, "utf8")));
  }
  return { urls, problems };
}

// Every problem with one listed URL.
export function checkUrl(dir, origin, loc, redirects = redirectRules(dir)) {
  let u, p;
  try { u = new URL(loc); p = decodeURIComponent(u.pathname); } catch { return ["not a URL"]; }
  if (u.origin !== new URL(origin).origin) return ["other origin"];
  const reasons = [];
  if (redirects.some((r) => r.test(trimSlash(p)))) reasons.push("redirect rule");
  const r = resolvePath(dir, p);
  if (r.reason) reasons.push(r.reason);
  else if (r.file.toLowerCase().endsWith(".html") && isNoindex(readFileSync(r.file, "utf8"))) reasons.push("noindex");
  return reasons;
}

// { count, problems: [{url, reason}] } for a built dir, or throws when it has no sitemap.
export function checkSitemap(dir, origin) {
  const found = sitemapUrls(dir, origin);
  if (!found) throw new Error(`no sitemap.xml or sitemap-index.xml in ${dir}`);
  const redirects = redirectRules(dir), problems = [...found.problems];
  for (const url of found.urls) for (const reason of checkUrl(dir, origin, url, redirects)) problems.push({ url, reason });
  if (!found.urls.length) problems.push({ url: new URL(origin).origin + "/", reason: "the sitemap lists no URLs" });
  return { count: found.urls.length, problems };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--origin"), dir = args[0], origin = i === -1 ? null : args[i + 1]?.replace(/\/$/, "");
  if (!dir || dir === "--origin" || !origin || !/^https?:\/\/[^/]+$/.test(origin)) {
    console.error("usage: sitemap-check.mjs <built-dir> --origin https://host");
    process.exit(2);
  }
  let result;
  try { result = checkSitemap(dir, origin); } catch (err) { console.error(`sitemap-check: ${err.message}`); process.exit(1); }
  for (const { url, reason } of result.problems) console.log(`${url}: ${reason}`);
  if (result.problems.length) process.exit(1);
  console.log(`sitemap-check: ${result.count} URLs, each served as listed`);
}
