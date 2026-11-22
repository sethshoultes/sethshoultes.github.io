"""Site templates: the docs library (site-kit#485). A product's help docs, kept as Markdown in the product's own repo and
vendored into the site at a pinned commit by scripts/docs_sync.py, become shelved, searchable pages in the site's design.
Key is first (sethshoultes/doorman's docs/help); Foo and MyWebsiteMemory use it by config alone.

  .sitekit/docs.json   the site's config: {"source": {"repo", "path", "commit"}, "title", "shelves": [{"key", "title"}]}
  .sitekit/docs.lock   what docs_sync wrote: the source, the commit and each file's sha256; a file that differs stops the build
  data/docs/*.md       one doc each, its slug the file name, front matter: title, shelf, hint, covers, screens, updated
  data/docs/features.json   the product's feature registry: a doc's covers must name one (the lead on site-kit#485)

  /docs/               the shelves in the config's order, each doc's title and hint, and a search box
  /docs/<slug>/        one doc, rendered from escaped Markdown, under the way back to its shelf and when it was updated
  /docs/<slug>.md      its twin
  /docs/index.json     slug, title, shelf, hint and the doc's words, for the search script, the product's app and its agent
  /docs/search.js      the search: same origin, no third party, no cookies; /docs/ lists every doc without it
  /docs/docs.css       the docs pages' own styles, linked only from them, so a site's blocks.css stays as it was

The Markdown is the product's, read as data: every character of text is escaped, and only headings (## and ###),
paragraphs, lists, **strong**, *em*, `code` and [links](...) are made (no _em_, so a snake_case word stays as it is). A link's target must be http, https, mailto or
this site's own path, or the build stops on that doc. A site with no .sitekit/docs.json builds as before. Standard library only.
"""
import datetime
import hashlib
import json
import pathlib
import re

import layout
import serialize

CONFIG = ".sitekit/docs.json"
LOCK = ".sitekit/docs.lock"
DIR = "data/docs"
INDEX = "/docs/"
SEARCH_JS = "docs/search.js"
DOCS_CSS = "docs/docs.css"
INDEX_JSON = "docs/index.json"
SLUG = re.compile(r"[a-z0-9][a-z0-9-]{0,63}\Z")
KEY = re.compile(r"[a-z][a-z-]{0,39}\Z")
REPO = re.compile(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\Z")
COMMIT = re.compile(r"[0-9a-f]{40}\Z")
DATE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}\Z")   # ASCII digits only; a real day is checked in front_matter
MONTHS = ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November",
          "December")   # fixed, not %B: the build machine's locale never changes a page
FIELDS = ("title", "shelf", "hint", "covers", "screens", "updated")
HERO_FIELDS = ("hero_image", "hero_alt", "hero_caption")   # optional (site-kit#516, #519): the page's hero art, its alt, its caption
FIGURE = re.compile(r'!\[([^\]]*)\]\((/docs-img/[a-z0-9][a-z0-9-]{0,63}\.webp)(?: "([^"]*)")?\)')


def strict(name, text):
    """JSON that refuses a key repeated in one object (plain json keeps the last one silently)."""
    def pairs(items):
        out = {}
        for k, v in items:
            if k in out:
                raise layout.LayoutError(f"{name}: {k} is repeated")
            out[k] = v
        return out
    try:
        return json.loads(text, object_pairs_hook=pairs)
    except json.JSONDecodeError as e:
        raise layout.LayoutError(f"{name} can't be read: {e}") from None


def front_matter(name, text):
    """(fields, body) from a doc: a --- block of key: value lines, each of FIELDS once, nothing else."""
    m = re.match(r"---\n(.*?)\n---\n", text, re.S)
    if not m:
        raise layout.LayoutError(f"{name}: no front matter")
    f = {}
    for line in m.group(1).split("\n"):
        kv = re.fullmatch(r"([a-z_]+): (.*)", line)
        if not kv:
            raise layout.LayoutError(f"{name}: not a front-matter line: {line!r}")
        if kv.group(1) in f:
            raise layout.LayoutError(f"{name}: {kv.group(1)} is repeated")
        if kv.group(1) not in FIELDS + HERO_FIELDS:
            raise layout.LayoutError(f"{name}: unknown key {kv.group(1)}")
        f[kv.group(1)] = kv.group(2)
    for k in FIELDS:
        if not f.get(k):
            raise layout.LayoutError(f"{name}: {k} is missing")
    try:
        if not DATE.fullmatch(f["updated"]):
            raise ValueError
        datetime.date.fromisoformat(f["updated"])   # 2026-13-45 and 2026-02-30 are no day (maint-review on #505)
    except ValueError:
        raise layout.LayoutError(f"{name}: updated must be a date, like 2026-11-19") from None
    if len(f["hint"]) > 140:
        raise layout.LayoutError(f"{name}: the hint is over 140 characters")
    slug = pathlib.PurePosixPath(name).stem
    if set(f) & set(HERO_FIELDS):   # the hero: art and alt together, the art at the page's own path, a caption only with art
        if not (f.get("hero_image") and f.get("hero_alt")):
            raise layout.LayoutError(f"{name}: hero_image and hero_alt go together")
        if f["hero_image"] != f"/img/hero/docs-{slug}.webp":
            raise layout.LayoutError(f"{name}: hero_image must be /img/hero/docs-{slug}.webp")
        if len(f["hero_alt"]) > 160 or len(f.get("hero_caption", "")) > 120:
            raise layout.LayoutError(f"{name}: hero_alt is at most 160 characters and hero_caption at most 120")
    return f, text[m.end():].strip()


def source_problem(src):
    """Why a config's "source" is refused, or None: the one definition docs_sync.py checks too, before any call. The path
    is plain (no "#", "?", "..", a leading "/" or anything that would end a URL's path and lose the pinned commit)."""
    if not (isinstance(src, dict) and set(src) == {"repo", "path", "commit"} and isinstance(src["repo"], str)
            and REPO.fullmatch(src["repo"]) and isinstance(src["commit"], str) and COMMIT.fullmatch(src["commit"])
            and isinstance(src["path"], str) and re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_./-]{0,199}", src["path"])
            and ".." not in src["path"].split("/")):
        return 'source must be {"repo": owner/name, "path": a plain folder path, "commit": a full 40-hex commit}'
    return None


def no_links(root):
    """Refuse a symlink at .sitekit/, .sitekit/docs.json or .sitekit/docs.lock (maint-review on site-kit#506), at data/,
    data/docs/ or any file in it: the config, the lock and the docs are read and written only inside the site."""
    root = pathlib.Path(root)
    folder = root / DIR
    for p in ((root / CONFIG).parent, root / CONFIG, root / LOCK, folder.parent, folder, *(folder.iterdir() if folder.is_dir() and not folder.is_symlink() else ())):
        if p.is_symlink():
            raise layout.LayoutError(f"{p.relative_to(root)} is a symlink: the docs live only in the site's own {DIR}/")


def load(root):
    """{"config", "features", "docs"}, or None for a site with no .sitekit/docs.json. Every refusal, before anything is
    written: a config, lock or registry that is wrong, a file that differs from the lock, a doc whose shelf is not in the
    config or whose covers is not in the registry, and any Markdown that render() refuses."""
    root = pathlib.Path(root)
    if (root / CONFIG).is_dir() and not (root / CONFIG).is_symlink():   # never read as "no docs" (maint-review on site-kit#507)
        raise layout.LayoutError(f"{CONFIG} is a folder: the docs config is a file")
    if not (root / CONFIG).is_file() and not (root / CONFIG).is_symlink():
        return None
    no_links(root)   # before the config is read: a link, even a dangling one, is refused
    cfg = strict(CONFIG, (root / CONFIG).read_text(encoding="utf-8"))
    src, shelves = cfg.get("source"), cfg.get("shelves")
    if source_problem(src):
        raise layout.LayoutError(f"{CONFIG}: {source_problem(src)}")
    if not (isinstance(cfg.get("title"), str) and cfg["title"].strip()
            and isinstance(shelves, list) and shelves and set(cfg) == {"source", "title", "shelves"}):
        raise layout.LayoutError(f'{CONFIG} must be {{"source": {{"repo", "path", "commit": 40 hex}}, "title", "shelves": [...]}}')
    keys = []
    for s in shelves:
        if not (isinstance(s, dict) and set(s) == {"key", "title"} and KEY.fullmatch(str(s["key"])) and isinstance(s["title"], str)
                and s["title"].strip()) or s["key"] in keys:
            raise layout.LayoutError(f'{CONFIG}: each shelf is {{"key": a slug, "title": text}}, each key once')
        keys.append(s["key"])
    if not (root / LOCK).is_file():
        raise layout.LayoutError(f"{CONFIG} names docs, but {LOCK} is missing: run scripts/docs_sync.py sync")
    lock = strict(LOCK, (root / LOCK).read_text(encoding="utf-8"))
    if {k: lock.get(k) for k in ("repo", "path", "commit")} != src or not isinstance(lock.get("files"), dict):
        raise layout.LayoutError(f"{LOCK} is for another source or commit than {CONFIG}: run scripts/docs_sync.py sync")
    folder = root / DIR
    on_disk = sorted(p.name for p in folder.iterdir()) if folder.is_dir() else []
    if on_disk != sorted(lock["files"]):
        raise layout.LayoutError(f"{DIR} holds other files than {LOCK} lists: run scripts/docs_sync.py sync")
    for name, digest in lock["files"].items():
        if hashlib.sha256((folder / name).read_bytes()).hexdigest() != digest:
            raise layout.LayoutError(f"{DIR}/{name} differs from {LOCK}: docs are changed in the product's repo, then synced")
    if "features.json" not in lock["files"]:
        raise layout.LayoutError(f"{DIR}/features.json, the product's feature registry, is missing")
    reg = strict(f"{DIR}/features.json", (folder / "features.json").read_text(encoding="utf-8")).get("features")
    if not (isinstance(reg, dict) and reg and all(KEY.fullmatch(k) and isinstance(v, str) and v.strip() for k, v in reg.items())):
        raise layout.LayoutError(f'{DIR}/features.json must be {{"features": {{feature id: what it is}}}}')
    docs = []
    for name in sorted(n for n in lock["files"] if n.endswith(".md")):
        slug = name[:-3]
        if not SLUG.fullmatch(slug):
            raise layout.LayoutError(f"{DIR}/{name}: the file name is not a slug")
        f, body = front_matter(f"{DIR}/{name}", (folder / name).read_text(encoding="utf-8"))
        if f["shelf"] not in keys:
            raise layout.LayoutError(f"{DIR}/{name}: shelf {f['shelf']} is not one of {CONFIG}'s shelves")
        if f["covers"] not in reg:
            raise layout.LayoutError(f"{DIR}/{name}: covers {f['covers']} is not a feature in features.json")
        docs.append({"slug": slug, **{k: f[k] for k in ("title", "shelf", "hint", "covers", "updated")},
                     "hero": {k[5:]: f[k] for k in HERO_FIELDS if k in f} or None,
                     "html": render(f"{DIR}/{name}", body), "text": words(body)})
    if not docs:
        raise layout.LayoutError(f"{DIR} has no docs")
    return {"config": cfg, "features": reg, "docs": docs}


INLINE = re.compile(r"`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*")   # no _em_: it would catch snake_case


def href(name, url):
    """The link target, escaped, when it is http, https, mailto or this site's own path; anything else stops the build. A
    backslash, a space or a control character anywhere is refused first: browsers read "/\\" as "//" (another host)."""
    if re.search(r"[\\\s\x00-\x1f\x7f]", url):
        raise layout.LayoutError(f"{name}: the link {url!r} holds a backslash, a space or a control character")
    if (url.startswith("/") and not url.startswith("//")) or url.startswith("#") or re.match(r"(?i)(https?://|mailto:)", url):
        return serialize.escape(url)
    raise layout.LayoutError(f"{name}: the link {url!r} is not http, https, mailto or one of this site's own paths")


def inline(name, text, links=True):
    """One run of text: every character escaped, with code, links, strong and em made from the Markdown around them."""
    out, at = [], 0
    for m in INLINE.finditer(text):
        out.append(serialize.escape(text[at:m.start()]))
        code, label, url, strong, em = m.groups()
        if code is not None:
            out.append(f"<code>{serialize.escape(code)}</code>")
        elif label is not None and links:
            out.append(f'<a href="{href(name, url)}">{inline(name, label, links=False)}</a>')
        elif label is not None:
            out.append(serialize.escape(m.group(0)))
        elif strong is not None:
            out.append(f"<strong>{inline(name, strong, links)}</strong>")
        else:
            out.append(f"<em>{inline(name, em, links)}</em>")
        at = m.end()
    out.append(serialize.escape(text[at:]))
    return "".join(out)


def render(name, body):
    """The doc's Markdown as HTML: blocks split on blank lines; ## and ### headings; - and 1. lists (a line that does not
    start an item continues the one before); every other block a paragraph. No raw HTML: it is text like any other."""
    out = []
    for block in re.split(r"\n\s*\n", body.strip()):
        lines = [ln.rstrip() for ln in block.split("\n")]
        fig = FIGURE.fullmatch(lines[0]) if len(lines) == 1 else None
        if fig:   # site-kit#516: a figure, alt required; build.py puts the file's width and height on it
            alt, src, cap = fig.group(1).strip(), fig.group(2), (fig.group(3) or "").strip()
            if not alt or len(alt) > 160 or len(cap) > 120:
                raise layout.LayoutError(f"{name}: a figure needs alt text of up to 160 characters, and a caption of up to 120")
            e = serialize.escape
            # loading="lazy" after alt: build.py's sizer matches '<img src="..." alt="' (hero art stays eager)
            out.append(f'<figure class="wp-block-image doc-figure"><img src="{src}" alt="{e(alt)}" loading="lazy"/>'
                       + (f'<figcaption class="wp-element-caption">{e(cap)}</figcaption>' if cap else "") + "</figure>")
            continue
        if lines[0].startswith("!["):
            raise layout.LayoutError(f"{name}: a figure is a line of its own: ![alt](/docs-img/<name>.webp \"caption\"), WebP under /docs-img/")
        h = re.fullmatch(r"(#{2,3}) (.+)", lines[0])
        if h and len(lines) == 1:
            out.append(f"<h{len(h.group(1))}>{inline(name, h.group(2))}</h{len(h.group(1))}>")
            continue
        kind = "ul" if re.match(r"- ", lines[0]) else "ol" if re.match(r"\d+\. ", lines[0]) else None
        if kind:
            items = []
            for ln in lines:
                m = re.match(r"- (.*)" if kind == "ul" else r"\d+\. (.*)", ln)
                if m:
                    items.append(m.group(1))
                else:
                    items[-1] += " " + ln.strip()
            out.append(f"<{kind}>" + "".join(f"<li>{inline(name, i)}</li>" for i in items) + f"</{kind}>")
            continue
        if re.match(r"#", lines[0]):
            raise layout.LayoutError(f"{name}: only ## and ### headings, each a block of its own (the page's title is its #)")
        out.append(f"<p>{inline(name, ' '.join(ln.strip() for ln in lines))}</p>")
    return "".join(out)


def words(body):
    """The doc's plain words for search: the Markdown's marks and link targets dropped."""
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", body)
    return re.sub(r"\s+", " ", re.sub(r"[#*_`>-]", " ", text)).strip()


def url(d):
    return f"{INDEX}{d['slug']}/"


def hero(d):
    """A doc's hero (site-kit#516, #519): the kit's own hero block, its title and hint over the art, so a docs page opens as
    every family page does. [] for a doc with no hero_image, which renders exactly as before."""
    if not d.get("hero"):
        return []
    props = {"heading": d["title"], "lead": d["hint"], "image": {"src": d["hero"]["image"], "alt": d["hero"]["alt"]}}
    if d["hero"].get("caption"):
        props["caption"] = d["hero"]["caption"]
    return [{"id": f"doc-{d['slug']}", "block": "hero@1", "props": props}]


def with_pages(record, lib):
    """The record with /docs/ (unless it has one) and a page per doc, in no menu, each described by its hint."""
    if not lib:
        return record
    pages = list(record["pages"])
    if not any(isinstance(p, dict) and p.get("path") == INDEX for p in pages):
        pages.append({"path": INDEX, "type": "page", "title": lib["config"]["title"], "menu": "none", "sections": [],
                      "description": f"{lib['config']['title']}: every doc, by shelf, with a search."})
    pages += [{"path": url(d), "type": "page", "title": d["title"], "description": d["hint"], "menu": "none", "sections": hero(d)}
              for d in lib["docs"]]
    return {**record, "pages": pages}


def main(lib):
    """{page path: the HTML the docs add to that page's main}: /docs/'s search and shelves, and each doc's article."""
    if not lib:
        return {}
    e, out = serialize.escape, {}
    shelf_title = {s["key"]: s["title"] for s in lib["config"]["shelves"]}
    for d in lib["docs"]:
        # Under the title, the way back (the library, then the doc's own shelf) and when it was updated, small; what it
        # covers stays in /docs/index.json for the search, as the hint says it on /docs/ (the designer on site-kit#485).
        day = datetime.date.fromisoformat(d["updated"])
        out[url(d)] = (f'<article class="wp-block-group doc"><p class="doc-meta"><a href="{INDEX}">{e(lib["config"]["title"])}</a> / '
                       f'<a href="{INDEX}#shelf-{e(d["shelf"])}">{e(shelf_title[d["shelf"]])}</a> · '
                       f'Updated {day.day} {MONTHS[day.month - 1]} {day.year}</p>{d["html"]}'
                       f'<p><a href="{INDEX}">All the docs</a></p></article>')
    shelves = []
    for s in lib["config"]["shelves"]:
        # Each doc a card, in the site's own services cards (blocks.css and the look's rules), so /docs/ reads as the site.
        listed = "".join(f'<div class="wp-block-column" data-doc="{e(d["slug"])}"><h3 class="wp-block-heading"><a href="{url(d)}">{e(d["title"])}</a></h3>'
                         f'<p class="doc-hint">{e(d["hint"])}</p></div>'
                         for d in lib["docs"] if d["shelf"] == s["key"])
        if listed:
            shelves.append(f'<section class="wp-block-group docs-shelf services" id="shelf-{e(s["key"])}"><h2 class="wp-block-heading">{e(s["title"])}</h2>'
                           f'<div class="wp-block-columns docs-list">{listed}</div></section>')
    out[INDEX] = ('<div class="wp-block-group docs-search-band"><form class="docs-search" role="search" hidden>'
                  '<label for="docs-q">Search the docs</label><input id="docs-q" type="search" autocomplete="off" placeholder="Try a word, like key or delete">'
                  '<p class="docs-count" aria-live="polite"></p></form></div>'
                  f'<script src="/{SEARCH_JS}" defer></script>\n' + "\n".join(shelves))
    return out


SEARCH = """// The docs library's search (site-kit#485): same origin, no third party, no cookies. With no script the form stays hidden
// and /docs/ lists every doc; with it, each typed word must be in a doc's title, hint or words for the doc to stay listed.
(function () {
  var form = document.querySelector(".docs-search"), q = document.getElementById("docs-q");
  if (!form || !q || !window.fetch) return;
  fetch("/docs/index.json").then(function (r) { return r.json(); }).then(function (index) {
    var text = {};
    index.docs.forEach(function (d) { text[d.slug] = (d.title + " " + d.hint + " " + d.words).toLowerCase(); });
    form.hidden = false;
    q.addEventListener("input", function () {
      var terms = q.value.toLowerCase().split(/\\s+/).filter(Boolean), shown = 0;
      document.querySelectorAll("[data-doc]").forEach(function (el) {
        var hit = terms.every(function (t) { return (text[el.getAttribute("data-doc")] || "").indexOf(t) >= 0; });
        el.hidden = !hit; if (hit) shown++;
      });
      document.querySelectorAll(".docs-shelf").forEach(function (s) { s.hidden = !s.querySelector("[data-doc]:not([hidden])"); });
      form.querySelector(".docs-count").textContent = terms.length ? shown + (shown === 1 ? " doc" : " docs") + " found" : "";
    });
  });
})();
"""


STYLE = '/* The docs library (site-kit#485): the search in the content column, each hint under its title, quieter. Linked only\n   from the docs pages, so every other page, and every site with no docs, is unchanged. */\n.docs-search label { display: block; font-weight: 700; margin-bottom: .35rem; }\n.docs-search input { width: 100%; max-width: 32rem; font: inherit; padding: .5rem .75rem; border: 2px solid var(--st-ink); border-radius: .25rem; background: var(--st-ground); color: var(--st-ink); }\n.docs-search input:focus-visible { outline: 3px solid var(--st-accent); outline-offset: 2px; }\n.docs-search-band { padding-bottom: .5rem; }\n.docs-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); }\n.docs-list [data-doc][hidden] { display: none; }\n.docs-list h3 { font-size: 1.15rem; }\n.docs-list [data-doc] { position: relative; }\n.docs-list h3 a { text-decoration: none; }\n.docs-list h3 a:hover, .docs-list h3 a:focus-visible { text-decoration: underline; }\n.docs-list h3 a::after { content: \"\"; position: absolute; inset: 0; }\n.doc { max-width: 42rem; }\n.doc-hint, .doc-meta, .docs-count { color: var(--st-muted); }\n.doc-meta { font-size: .875rem; margin-top: -1rem; }\n/* The figures of a doc (site-kit#554, the designer on key-site#39): a caption reads as a caption, under its figure with room\n   before the next step. A hero with art follows the kit rule in render.py (site-kit#569). */\n.doc figure { margin: 1.5rem 0 1.75rem; }\n.doc figcaption { margin-top: .5rem; font-size: .85rem; font-style: italic; color: var(--st-muted); text-align: center; }\n/* A long name in inline code (a scoped package, a path) wraps inside its card instead of running past it on a phone (the designer on key-site#57). */\n.doc code { overflow-wrap: anywhere; }\n'


def head(lib, path):
    """The <link> to the docs' own stylesheet, on /docs/ and each doc's page only."""
    if not lib or not (path == INDEX or any(path == url(d) for d in lib["docs"])):
        return []
    return [f'<link rel="stylesheet" href="/{DOCS_CSS}">']


def ink_links(scope):
    """site-kit#530: in a look whose accent is under 4.5:1 where the docs sit (Key's golden-age gold on cream, 1.84:1), a doc's
    links (its breadcrumb, "All the docs", its own) take the ink with the accent as their underline, and the index's titles
    the ink. `scope` is "" for the base look, or that look's html[data-variant="<key>"]."""
    at = f"{scope} " if scope else ""
    return (f"{at}.doc a:not(.wp-block-button__link) {{ color: var(--st-ink); text-decoration: underline; text-decoration-color: var(--st-accent); "
            f"text-decoration-thickness: 2px; text-underline-offset: 4px; }}\n{at}.docs-list a {{ color: var(--st-ink); }}\n")


def files(lib, made, ink_scopes=()):
    """{site path: text}: /docs/index.json, the search script, the docs' stylesheet (with ink_links for each look in
    `ink_scopes`), and each doc's twin at /docs/<slug>.md from `made`."""
    if not lib:
        return {}
    index = {"title": lib["config"]["title"], "commit": lib["config"]["source"]["commit"],
             "shelves": lib["config"]["shelves"],
             "docs": [{k: d[k] for k in ("slug", "title", "shelf", "hint", "covers", "updated")} | {"url": url(d), "words": d["text"]}
                      for d in lib["docs"]]}
    out = {INDEX_JSON: json.dumps(index, ensure_ascii=False, indent=1) + "\n", SEARCH_JS: SEARCH, DOCS_CSS: STYLE + "".join(ink_links(s) for s in ink_scopes)}
    out.update({f"docs/{d['slug']}.md": made[f"docs/{d['slug']}/index.md"] for d in lib["docs"] if f"docs/{d['slug']}/index.md" in made})
    return out
