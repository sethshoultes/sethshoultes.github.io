// agent-files (site-kit#114): a markdown twin for every built page, after the build. dist/x/index.html -> dist/x/index.md
// (the home -> dist/index.md). The twin is the page's own <main>, under its h1, address and description: the same words
// as the HTML, nothing added. A noindex page, or one whose canonical is another site's, gets none. With --llms-full the
// twins are also joined into dist/llms-full.txt. A page with no <main> fails the run, unless --skip-no-main, which
// leaves that page without a twin and names it (site-kit#193: a site's standalone game pages are whole documents).
// Generalised from smartwebutah.com's markdown-twins.mjs (and
// memberpress.ai's markdownTwins.mjs) so no site keeps its own copy.
//
//   node plugins/agent-files/scripts/twins.mjs dist --origin https://example.com [--llms-full "Example: every page"] [--skip-no-main]
//
// The HTML-to-markdown step is turndown (+ turndown-plugin-gfm), taken from the site's own node_modules.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
const attr = (html, re) => html.match(re)?.[1] ?? null;
// An attribute's value up to its own closing quote, so "Google's" keeps its apostrophe.
const meta = (html, key, name) => html.match(new RegExp(`<meta[^>]*${key}=["']${name}["'][^>]*content=(["'])(.*?)\\1`, "i"))?.[2]
  ?? html.match(new RegExp(`<meta[^>]*content=(["'])(.*?)\\1[^>]*${key}=["']${name}["']`, "i"))?.[2] ?? null;

/** The twin for one built page, or null when the page should have none. `convert(html)` turns HTML into markdown. An
 * indexable page with no <main> throws, or, given `onNoMain`, is reported to it by its canonical and gets none. */
export function pageToMarkdown(html, { origin, convert, onNoMain = null }) {
  if (/noindex/i.test(meta(html, "name", "robots") ?? "")) return null;
  const canonical = attr(html, /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)
    ?? attr(html, /<link[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
  if (!canonical || !(canonical === origin || canonical.startsWith(`${origin}/`))) return null;
  const open = html.match(/<main\b[^>]*>/i);
  const end = open ? html.indexOf("</main>", open.index) : -1;
  if (!open || end === -1) {
    if (!onNoMain) throw new Error(`${canonical}: no <main> ... </main>`);
    onNoMain(canonical);
    return null;
  }
  const main = html.slice(open.index + open[0].length, end).replace(/\b(href|src)=(["'])\/(?!\/)/g, `$1=$2${origin}/`);
  const title = unescape(meta(html, "property", "og:title") ?? attr(html, /<title>([^<]*)<\/title>/i) ?? "");
  const description = unescape(meta(html, "name", "description") ?? "");
  const h1 = main.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const heading = h1 ? unescape(h1[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()) : title;
  const body = convert(h1 ? main.replace(h1[0], "") : main).trim();
  const lead = [canonical, description].filter(Boolean).map((s) => `${s}\n\n`).join("");
  return { markdown: `# ${heading}\n\n${lead}${body}\n`, title: heading, canonical };
}

function pages(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? pages(full) : e.name === "index.html" ? [full] : [];
  });
}

/** Write every twin under `dist`; with `llmsFull` (a title) also dist/llms-full.txt. Returns the twins written. With
 * `skipped` (an array), a page with no <main> gets no twin and its canonical is pushed there instead of throwing. */
export function writeTwins(dist, { origin, convert, llmsFull = null, skipped = null }) {
  const twins = [];
  const onNoMain = skipped ? (canonical) => skipped.push(canonical) : null;
  for (const file of pages(dist).sort()) {
    const t = pageToMarkdown(readFileSync(file, "utf8"), { origin, convert, onNoMain });
    if (t === null) continue;
    writeFileSync(file.replace(/index\.html$/, "index.md"), t.markdown);
    twins.push(t);
  }
  if (llmsFull) {
    const full = twins.map((t) => `<!-- ${t.canonical} -->\n\n${t.markdown}`).join("\n---\n\n");
    writeFileSync(path.join(dist, "llms-full.txt"), `# ${llmsFull}\n\nEach section is one page, in the same words as the page itself. Its address is in the comment above it.\n\n---\n\n${full}`);
  }
  return twins;
}

/** turndown, set up the way the twins read: atx headings, - bullets, GFM tables, alt text kept, no scripts or forms. */
export function turndownConverter(fromDir = process.cwd()) {
  const require = createRequire(path.join(fromDir, "package.json"));
  const TurndownService = require("turndown");
  const { gfm } = require("turndown-plugin-gfm");
  const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });
  td.use(gfm);
  td.remove(["script", "style", "noscript", "template", "svg", "form", "picture"]);
  td.addRule("img", { filter: "img", replacement: (_, n) => (n.getAttribute("alt") ? `\n\n*${n.getAttribute("alt")}*\n\n` : "") });
  td.addRule("summary", { filter: "summary", replacement: (c) => `\n\n### ${c.trim()}\n\n` });
  return (html) => td.turndown(html);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const args = process.argv.slice(2);
  const flag = (n) => { const i = args.indexOf(n); return i === -1 ? null : args[i + 1]; };
  const dist = args[0], origin = flag("--origin");
  if (!dist || !origin || !/^https:\/\/[^/]+$/.test(origin)) {
    console.error('usage: twins.mjs DIST --origin https://host [--llms-full "Title"] [--skip-no-main]');
    process.exit(2);
  }
  const skipped = args.includes("--skip-no-main") ? [] : null;
  const twins = writeTwins(dist, { origin, convert: turndownConverter(), llmsFull: flag("--llms-full"), skipped });
  if (skipped?.length) console.log(`twins: ${skipped.length} page(s) with no <main> left without a twin: ${skipped.join(" ")}`);
  if (!twins.length) { console.error(`twins: no page under ${dist} got a twin`); process.exit(1); }
  console.log(`twins: ${twins.length} written${flag("--llms-full") ? ", joined into llms-full.txt" : ""}`);
}
