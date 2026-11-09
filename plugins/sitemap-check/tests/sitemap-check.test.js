// plugins/sitemap-check (site-kit#262): each rule passes a URL Pages serves as listed and fails one it does not, on a built
// dir made in a temp folder. Plus the sitemap-index path and the CLI's output and exit code.
import test, { after } from "node:test";
import assert from "node:assert";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkSitemap, checkUrl, decodeXml, isNoindex, locs } from "../scripts/sitemap-check.mjs";

const ORIGIN = "https://example.com";
const SCRIPT = fileURLToPath(new URL("../scripts/sitemap-check.mjs", import.meta.url));
const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

const PAGE = "<!doctype html><title>x</title><p>x</p>";
// A built dir holding these files ({relative path: contents}).
function site(files) {
  const d = mkdtempSync(path.join(tmpdir(), "sitemap-check-"));
  dirs.push(d);
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(d, rel)), { recursive: true });
    writeFileSync(path.join(d, rel), body);
  }
  return d;
}
const urlset = (...paths) => `<?xml version="1.0"?><urlset>${paths.map((p) => `<url><loc>${p.startsWith("http") ? p : ORIGIN + p}</loc></url>`).join("")}</urlset>`;
const reasons = (files, url) => checkUrl(site(files), ORIGIN, url.startsWith("http") ? url : ORIGIN + url);

test("XML entities and percent-encoding in a <loc> are decoded", () => {
  assert.equal(decodeXml("a&amp;b&lt;&gt;&quot;&apos;&#39;&#x41;"), `a&b<>"''A`);
  assert.deepEqual(locs("<urlset><url><loc> https://example.com/a?x=1&amp;y=2 </loc></url></urlset>"), ["https://example.com/a?x=1&y=2"]);
  assert.deepEqual(reasons({ "café/index.html": PAGE }, "/caf%C3%A9/"), []);
  assert.deepEqual(reasons({ "café/index.html": PAGE }, "/cafe/"), ["missing"]);
});

test("another origin fails", () => {
  assert.deepEqual(reasons({ "a/index.html": PAGE }, "/a/"), []);
  assert.deepEqual(reasons({ "a/index.html": PAGE }, "https://www.example.com/a/"), ["other origin"]);
  assert.deepEqual(reasons({ "a/index.html": PAGE }, "http://example.com/a/"), ["other origin"]);
});

test("/ is index.html", () => {
  assert.deepEqual(reasons({ "index.html": PAGE }, "/"), []);
  assert.deepEqual(reasons({ "a.html": PAGE }, "/"), ["missing"]);
});

test("/a/ needs a/index.html; a.html alone redirects; neither is missing", () => {
  assert.deepEqual(reasons({ "a/index.html": PAGE }, "/a/"), []);
  assert.deepEqual(reasons({ "a.html": PAGE }, "/a/"), ["redirects (Pages serves /a)"]);
  assert.deepEqual(reasons({ "b/index.html": PAGE }, "/a/"), ["missing"]);
});

test("/a needs a.html; a/index.html alone redirects to /a/; neither is missing", () => {
  assert.deepEqual(reasons({ "a.html": PAGE }, "/a"), []);
  assert.deepEqual(reasons({ "x/a.html": PAGE }, "/x/a"), []);
  assert.deepEqual(reasons({ "a/index.html": PAGE }, "/a"), ["redirects to /a/"]);
  assert.deepEqual(reasons({ "b.html": PAGE }, "/a"), ["missing"]);
});

test("/a.html and /a/index.html redirect to the clean URL, even when the file exists", () => {
  assert.deepEqual(reasons({ "a.html": PAGE, "a/index.html": PAGE }, "/a/"), []);
  assert.deepEqual(reasons({ "a.html": PAGE }, "/a.html"), ["redirects to the clean URL"]);
  assert.deepEqual(reasons({ "a/index.html": PAGE }, "/a/index.html"), ["redirects to the clean URL"]);
  assert.deepEqual(reasons({ "index.html": PAGE }, "/index.html"), ["redirects to the clean URL"]);
});

test("any other extension must exist as a file", () => {
  assert.deepEqual(reasons({ "docs/guide.pdf": "%PDF" }, "/docs/guide.pdf"), []);
  assert.deepEqual(reasons({ "docs/other.pdf": "%PDF" }, "/docs/guide.pdf"), ["missing"]);
  assert.deepEqual(reasons({ "feed.xml/index.html": PAGE }, "/feed.xml"), ["missing"]);   // a folder is not a file
});

test("a path outside the built dir is missing, even when that file exists", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "sitemap-check-"));
  dirs.push(parent);
  writeFileSync(path.join(parent, "secret.txt"), "x");
  const d = path.join(parent, "site");
  mkdirSync(path.join(d, "x"), { recursive: true });
  writeFileSync(path.join(d, "x", "secret.txt"), "x");
  assert.deepEqual(checkUrl(d, ORIGIN, ORIGIN + "/x/secret.txt"), []);
  assert.deepEqual(checkUrl(d, ORIGIN, ORIGIN + "/x%2F..%2F..%2Fsecret.txt"), ["missing"]);   // %2F survives the URL parser
});

test("/a.html/ redirects to the clean URL, even when a.html/index.html exists", () => {
  assert.deepEqual(reasons({ "a.html/index.html": PAGE }, "/a.html/"), ["redirects to the clean URL"]);
  assert.deepEqual(reasons({ "a.htm/index.html": PAGE }, "/a.htm/"), []);
});

test("a source in _redirects fails, with or without a trailing slash; comments and destinations do not count", () => {
  const files = { "a/index.html": PAGE, "b/index.html": PAGE, "c/index.html": PAGE,
    _redirects: "# /b/ /x 301\n\n/a /new 301\n/old /c/ 301\n" };
  assert.deepEqual(reasons(files, "/a/"), ["redirect rule"]);
  assert.deepEqual(reasons({ ...files, _redirects: "/a/ /new 301\n" }, "/a/"), ["redirect rule"]);
  assert.deepEqual(reasons(files, "/b/"), []);
  assert.deepEqual(reasons(files, "/c/"), []);
});

test("a _redirects splat matches any rest of the path, an empty one too, and :name one segment", () => {
  const files = { "blog/index.html": PAGE, "blog/x/index.html": PAGE, "blog/x/y/index.html": PAGE, "blogs/index.html": PAGE };
  const splat = { ...files, _redirects: "/blog/* /posts/:splat 301\n" };
  assert.deepEqual(reasons(splat, "/blog/"), ["redirect rule"]);
  assert.deepEqual(reasons(splat, "/blog/x/y/"), ["redirect rule"]);
  assert.deepEqual(reasons(splat, "/blogs/"), []);
  assert.deepEqual(reasons({ ...files, _redirects: "/bl* /x 301\n" }, "/blogs/"), ["redirect rule"]);
  const named = { ...files, _redirects: "/blog/:slug /posts/:slug 301\n" };
  assert.deepEqual(reasons(named, "/blog/x/"), ["redirect rule"]);
  assert.deepEqual(reasons(named, "/blog/x/y/"), []);   // one segment only
  assert.deepEqual(reasons(named, "/blog/"), []);
  assert.deepEqual(reasons({ ...files, _redirects: "/b.og/ /x 301\n" }, "/blog/"), []);   // a dot is literal
});

test("a 200 rule is a rewrite, not a redirect", () => {
  const files = { "a/index.html": PAGE };
  assert.deepEqual(reasons({ ...files, _redirects: "/a/ /b/ 200\n" }, "/a/"), []);
  assert.deepEqual(reasons({ ...files, _redirects: "/a/* /b/:splat 200\n" }, "/a/"), []);
  assert.deepEqual(reasons({ ...files, _redirects: "/a/ /b/ 302\n" }, "/a/"), ["redirect rule"]);
  assert.deepEqual(reasons({ ...files, _redirects: "/a/ /b/\n" }, "/a/"), ["redirect rule"]);   // no status is a 302
});

test("<meta name=robots> with noindex fails, in either attribute order and any case", () => {
  assert.equal(isNoindex('<meta name="robots" content="noindex, follow">'), true);
  assert.equal(isNoindex("<META CONTENT='NoIndex' NAME='Robots'>"), true);
  assert.equal(isNoindex("<meta content=noindex name=robots>"), true);
  assert.equal(isNoindex('<meta name="robots" content="index, follow">'), false);
  assert.equal(isNoindex('<meta name="googlebot" content="noindex">'), true);
  assert.equal(isNoindex('<meta content="NONE" name="GoogleBot">'), true);
  assert.equal(isNoindex('<meta name="robots" content="none">'), true);
  assert.equal(isNoindex('<meta name="googlebot" content="index">'), false);
  assert.equal(isNoindex('<meta name="bingbot" content="noindex">'), false);
  assert.equal(isNoindex('<meta name="robots" content="nonesuch, follow">'), false);
  assert.equal(isNoindex('<meta name="robots" content="max-image-preview:none">'), false);
  assert.equal(isNoindex('<meta name="robots" content="index, follow, max-image-preview:none">'), false);
  assert.equal(isNoindex('<meta name="robots" content="follow , NoIndex">'), true);
  assert.equal(isNoindex('<meta name="description" content="noindex is a word"><meta name="robots" content="all">'), false);
  assert.deepEqual(reasons({ "a/index.html": '<head><meta content="noindex" name="robots"></head>' }, "/a/"), ["noindex"]);
  assert.deepEqual(reasons({ "a/index.html": '<head><meta name="robots" content="index"></head>' }, "/a/"), []);
});

test("sitemap.xml: a clean site passes, a bad URL is named with its reason; no sitemap throws", () => {
  const good = site({ "sitemap.xml": urlset("/", "/a/", "/b"), "index.html": PAGE, "a/index.html": PAGE, "b.html": PAGE });
  assert.deepEqual(checkSitemap(good, ORIGIN), { count: 3, problems: [] });
  const bad = site({ "sitemap.xml": urlset("/", "/a.html"), "index.html": PAGE, "a.html": PAGE });
  assert.deepEqual(checkSitemap(bad, ORIGIN).problems, [{ url: ORIGIN + "/a.html", reason: "redirects to the clean URL" }]);
  assert.throws(() => checkSitemap(site({ "index.html": PAGE }), ORIGIN), /no sitemap/);
  assert.deepEqual(checkSitemap(site({ "sitemap.xml": urlset() }), ORIGIN).problems,
    [{ url: ORIGIN + "/", reason: "the sitemap lists no URLs" }]);
});

test("sitemap-index.xml: each same-origin child is read from the dir; another origin's or a missing child fails", () => {
  const files = { "index.html": PAGE, "a/index.html": PAGE, "b.html": PAGE,
    "sitemap-0.xml": urlset("/", "/a/"), "sitemap-1.xml": urlset("/b"),
    "sitemap-index.xml": `<sitemapindex><sitemap><loc>${ORIGIN}/sitemap-0.xml</loc></sitemap><sitemap><loc>${ORIGIN}/sitemap-1.xml</loc></sitemap></sitemapindex>` };
  assert.deepEqual(checkSitemap(site(files), ORIGIN), { count: 3, problems: [] });
  const withBad = { ...files, "sitemap-1.xml": urlset("/b", "/a") };
  assert.deepEqual(checkSitemap(site(withBad), ORIGIN).problems, [{ url: ORIGIN + "/a", reason: "redirects to /a/" }]);
  const others = { ...files, "sitemap-index.xml": `<sitemapindex><sitemap><loc>${ORIGIN}/sitemap-0.xml</loc></sitemap><sitemap><loc>https://evil.test/sitemap-1.xml</loc></sitemap><sitemap><loc>${ORIGIN}/sitemap-9.xml</loc></sitemap></sitemapindex>` };
  const r = checkSitemap(site(others), ORIGIN);
  assert.equal(r.count, 2);
  assert.deepEqual(r.problems, [{ url: "https://evil.test/sitemap-1.xml", reason: "other origin" },
    { url: ORIGIN + "/sitemap-9.xml", reason: "missing" }]);
  // A sitemap.xml that is itself an index takes the index path.
  const asIndex = checkSitemap(site({ ...files, "sitemap.xml": files["sitemap-index.xml"], "sitemap-index.xml": urlset("/") }), ORIGIN);
  assert.deepEqual(asIndex, { count: 3, problems: [] });
  const asIndexBad = checkSitemap(site({ ...withBad, "sitemap.xml": files["sitemap-index.xml"] }), ORIGIN);
  assert.deepEqual(asIndexBad.problems, [{ url: ORIGIN + "/a", reason: "redirects to /a/" }]);
  // sitemap.xml wins when both exist
  assert.equal(checkSitemap(site({ ...files, "sitemap.xml": urlset("/") }), ORIGIN).count, 1);
});

test("the CLI prints one line per problem and exits 1, or a one-line count and exits 0", () => {
  const run = (dir, ...extra) => spawnSync(process.execPath, [SCRIPT, dir, "--origin", ORIGIN, ...extra], { encoding: "utf8" });
  const ok = run(site({ "sitemap.xml": urlset("/"), "index.html": PAGE }));
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout, "sitemap-check: 1 URLs, each served as listed\n");
  const slash = spawnSync(process.execPath, [SCRIPT, site({ "sitemap.xml": urlset("/"), "index.html": PAGE }), "--origin", ORIGIN + "/"], { encoding: "utf8" });
  assert.equal(slash.status, 0, slash.stderr);   // --origin https://host/ is the same origin
  const bad = run(site({ "sitemap.xml": urlset("/", "/gone/", "/a"), "index.html": PAGE, "a/index.html": PAGE }));
  assert.equal(bad.status, 1);
  assert.equal(bad.stdout, `${ORIGIN}/gone/: missing\n${ORIGIN}/a: redirects to /a/\n`);
  const none = run(site({ "index.html": PAGE }));
  assert.equal(none.status, 1);
  assert.match(none.stderr, /no sitemap/);
  assert.equal(spawnSync(process.execPath, [SCRIPT, "dist"], { encoding: "utf8" }).status, 2);
});
