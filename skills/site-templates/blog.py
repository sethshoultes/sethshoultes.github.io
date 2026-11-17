"""Site templates: the blog (site-kit#321). A site built from a layout gets its posts from its data/blog.json, written by
the blog-writer skill, in the post page type's shape (markup/page-types/post/README.md). S'mores' own build is the
reference, so posts look and check the same on every site.

  /blog/<slug>/    each published post, as a page of the record (type "post", in no menu), so the page shell, the
                   sitemap, llms.txt and the .md twins treat it as they treat every page; plus its byline (linked to the
                   writer's bio on /blog/), its featured image, its BlogPosting and the feed's <link rel="alternate">,
                   then /blog/'s closing call to action, if that page has one (site-kit#327)
  /blog/           the record's own /blog/ page if it has one, else a plain page titled Blog: the posts, newest first,
                   above any FAQ or closing call to action, then the writers' bios
  /blog/feed.xml   Atom 1.0, the same posts
  /blog/<slug>.md  the post's twin where the post type looks for it, beside its index.md

A draft is never built. load() refuses the whole blog, before anything is written, on a post whose author is not in
data/writers.json, a bad slug, a published image without image_alt, or no image while the site has post images on
(.sitekit/features.json "post_images", on by default). The field rules are blog-writer's own functions, read from that
skill, so a post is held to one set of rules. Standard library only.
"""
import datetime
import hashlib
import importlib.util
import pathlib
import re

import agents
import layout
import serialize

# blog-writer's own field rules, loaded by load() only when the site has a data/blog.json: a site with no blog builds
# without the blog-writer skill vendored (site-kit#337).
BLOG_WRITER = pathlib.Path(__file__).resolve().parent.parent / "blog-writer" / "blog_writer.py"
bw = None


def _load_blog_writer():
    global bw
    if bw is None:
        if not BLOG_WRITER.is_file():
            raise layout.LayoutError("data/blog.json needs the blog-writer skill, which this site does not vendor: "
                                     "run site_sync.py sync <tag> --skills=<its skills>,blog-writer")
        spec = importlib.util.spec_from_file_location("blog_writer", BLOG_WRITER)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        bw = mod

INDEX = "/blog/"
FEED = "blog/feed.xml"
STATUSES = ("draft", "published")
# The date-and-writer line, on the post and under each card on /blog/: one <span class> inside a bare <p>, so the theme
# styles both alike and the .md twin (agents.to_markdown reads bare <p>s) keeps the byline.
BYLINE = "post-byline"
# Where /blog/'s list goes when its page has an FAQ or a closing call to action: above them, so the FAQ stays last (faq-last).
CLOSING = re.compile(r'<section id="[^"]*" class="wp-block-group (?:faq|cta)\b')


def load(root):
    """{"posts": the published posts, newest first, "writers": {id: writer}} from the site at `root`; no posts when it has no
    data/blog.json, or none published. Every problem with a published post stops the build (LayoutError)."""
    root = pathlib.Path(root)
    path = root / "data" / "blog.json"
    if not path.is_file():
        return {"posts": [], "writers": {}}
    _load_blog_writer()
    try:
        data = bw.read_json(path, "blog")
        roster = {w["id"]: w for w in bw.load_roster(root / "data" / "writers.json", bw.site_web_root(root))}
        images = bw.post_images_on(root)
    except bw.Invalid as e:
        raise layout.LayoutError("the blog is not valid, so nothing was built:\n  " + "\n  ".join(e.problems)) from None
    if not isinstance(data, dict) or not isinstance(data.get("posts"), list):
        raise layout.LayoutError('data/blog.json must be {"posts": [...]}')
    out, live, seen = [], [], set()
    for i, p in enumerate(data["posts"], 1):
        where = f"data/blog.json post {i}" + (f" ({p.get('slug')})" if isinstance(p, dict) else "")
        if not isinstance(p, dict) or p.get("status") not in STATUSES:
            out.append(f"{where}: status must be draft or published")
            continue
        if p["status"] == "draft":   # never built, so held to nothing more
            continue
        found = problems(p, roster, images)
        if not found and p["slug"] in seen:
            found = [f'slug "{p["slug"]}" is used twice']
        out += [f"{where}: {m}" for m in found]
        seen.add(p.get("slug"))
        live.append(p)
    if out:
        raise layout.LayoutError("the blog is not valid, so nothing was built:\n  " + "\n  ".join(out))
    return {"posts": sorted(live, key=lambda p: (p["date"], p["slug"]), reverse=True), "writers": roster}


def problems(p, roster, images):
    """What stops a published post being built."""
    out = [f"missing field: {k}" for k in bw.REQUIRED if not p.get(k)]
    if out:
        return out
    if not (isinstance(p["slug"], str) and bw.SLUG.match(p["slug"])):
        out.append("slug must be lowercase letters and digits joined by hyphens, like my-first-post")
    if not (isinstance(p["author"], str) and p["author"] in roster):
        out.append(f'author {p["author"]!r} is not a writer in data/writers.json')
    out += [f"{k} must be a real day, YYYY-MM-DD" for k in ("date", "updated") if k in p and not bw.real_date(p[k])]
    out += [f"{k} must be one line of words" for k in ("title", "description") if not isinstance(p[k], str) or "\n" in p[k]]
    if not (isinstance(p["body"], list) and all(isinstance(x, str) and x.strip() for x in p["body"])):
        out.append("body must be a list of paragraphs, each with words")
    else:
        out += bw.body_links(p)[1]   # blog-writer's gate: only its inline tags and http(s), /path and #anchor links
    out += bw.image_problems(p)
    if isinstance(p.get("image"), str) and not layout.SAFE_SRC.fullmatch("/" + p["image"]):
        out.append("image must be a path inside the site with a plain name, like assets/blog/my-first-post.webp")
    if images and not p.get("image"):
        out.append(bw.NO_IMAGE)
    return out


def url(p):
    return f"{INDEX}{p['slug']}/"


def bio(w):
    """Where a writer's bio is: their entry on /blog/."""
    return f"{INDEX}#writer-{w['id']}"


def day(iso):
    d = datetime.date.fromisoformat(iso)
    return f'<time datetime="{iso}">{d:%B} {d.day}, {d.year}</time>'


def join(record):
    """/blog/'s closing call to action (its last cta section), or None: the join band each post shows after its article."""
    page = next((p for p in record["pages"] if isinstance(p, dict) and p.get("path") == INDEX), None)
    ctas = [s for s in (page or {}).get("sections") or [] if isinstance(s, dict) and str(s.get("block", "")).partition("@")[0] == "cta"]
    return ctas[-1] if ctas else None


def with_pages(record, blog):
    """The record with a page for each post, in no menu, and a /blog/ page if it has none. Each post's one section is a
    copy of /blog/'s closing call to action, if it has one, so it renders and is styled as every section is; section ids
    are unique across the record, so the copy's id is made from the post's slug. layout.problems then checks them as it
    checks every page."""
    if not blog["posts"]:
        return record
    pages = list(record["pages"])
    if not any(isinstance(p, dict) and p.get("path") == INDEX for p in pages):
        pages.append({"path": INDEX, "type": "page", "title": "Blog", "sections": []})
    cta = join(record)
    band = lambda p: [{**cta, "id": "join-" + hashlib.sha1(p["slug"].encode()).hexdigest()[:10]}] if cta else []   # noqa: E731
    pages += [{"path": url(p), "type": "post", "title": p["title"], "description": p["description"], "menu": "none",
               "sections": band(p)} for p in blog["posts"]]
    return {**record, "pages": pages}


def paragraph(text):
    """One body paragraph. blog-writer's gate (body_links, in load) allows only em, strong, b, i, code, br and <a href> in
    it, and markdown links whose text and target hold no quote or angle bracket, so it is written as it is, with each
    markdown link made an <a> (or an <img>)."""
    return bw.STRICT_LINK.sub(lambda m: f'<img src="{m.group(2)}" alt="{m.group(1)}"/>' if m.group(0).startswith("!")
                              else f'<a href="{m.group(2)}">{m.group(1)}</a>', text)


def main(blog):
    """{page path: the HTML the blog adds to that page's main}: each post's byline, picture, body and a link back to /blog/,
    and /blog/'s list."""
    if not blog["posts"]:
        return {}
    e, writers = serialize.escape, blog["writers"]
    out = {}
    for p in blog["posts"]:
        w = writers[p["author"]]
        picture = f'<figure class="wp-block-image"><img src="/{e(p["image"])}" alt="{e(p["image_alt"])}"/></figure>' if p.get("image") else ""
        out[url(p)] = (f'<article class="wp-block-group post"><p><span class="{BYLINE}">By <a href="{bio(w)}">{e(w["name"])}</a> · {day(p["date"])}</span></p>'
                       + picture + "".join(f"<p>{paragraph(x)}</p>" for x in p["body"])
                       + f'<p><a href="{INDEX}">Back to the blog</a></p></article>')   # a plain link, so it takes the site's link style
    cards = "".join(f'<div class="wp-block-group post-card"><h2 class="wp-block-heading"><a href="{url(p)}">{e(p["title"])}</a></h2>'
                    f'<p><span class="{BYLINE}">{day(p["date"])} · {e(writers[p["author"]]["name"])}</span></p><p>{e(p["description"])}</p></div>'
                    for p in blog["posts"])
    # A writer's beat is blog-writer's routing slug, not words for a reader, so "Who writes here" shows the name and bio only.
    who = "".join(f'<div class="wp-block-group writer" id="writer-{w["id"]}"><h3 class="wp-block-heading">{e(w["name"])}</h3>'
                  f'<p>{e(w["bio"])}</p></div>' for w in writers.values())
    out[INDEX] = (f'<section class="wp-block-group posts">{cards}</section>\n'
                  f'<section class="wp-block-group writers"><h2 class="wp-block-heading">Who writes here</h2>{who}</section>')
    return out


def place(text, extra, end):
    """`text` with `extra` put above its first FAQ or closing call to action before `end`, else at `end`."""
    m = CLOSING.search(text, 0, end)
    at = m.start() if m else end
    return text[:at] + extra + "\n" + text[at:]


def head(blog, path, name, origin):
    """What the page's <head> gains: the feed's link on /blog/ and on each post, and each post's BlogPosting."""
    p = next((p for p in blog["posts"] if url(p) == path), None)
    if not blog["posts"] or not (path == INDEX or p):
        return []
    out = [f'<link rel="alternate" type="application/atom+xml" href="/{FEED}" title="{serialize.escape(name)} blog">']
    if p:
        w, u = blog["writers"][p["author"]], origin + path
        ld = {"@context": "https://schema.org", "@type": "BlogPosting", "@id": f"{u}#post", "url": u, "mainEntityOfPage": u,
              "headline": p["title"], "description": p["description"], "datePublished": p["date"],
              "dateModified": p.get("updated", p["date"]),
              "author": {"@type": "Person", "name": w["name"], "url": origin + bio(w), "description": w["bio"]},
              "publisher": {"@id": f"{origin}/#organization"}}
        if p.get("image"):
            ld["image"] = f"{origin}/{p['image']}"
        out.append(agents.script(ld))
    return out


def image(blog, path):
    """The post's featured image as a site path, for its og:image; None for any other page."""
    p = next((p for p in blog["posts"] if url(p) == path and p.get("image")), None)
    return "/" + p["image"] if p else None


def files(blog, name, origin, made):
    """{site path: text}: the Atom feed, and each post's twin at /blog/<slug>.md, copied from the index.md `made` holds."""
    if not blog["posts"]:
        return {}
    e = serialize.escape
    stamp = lambda p: f"{p.get('updated', p['date'])}T00:00:00Z"   # noqa: E731
    entries = "".join(
        f'<entry>\n<title>{e(p["title"])}</title>\n<link href="{origin}{url(p)}"/>\n<id>{origin}{url(p)}</id>\n'
        f"<updated>{stamp(p)}</updated>\n<summary>{e(p['description'])}</summary>\n"
        f"<author><name>{e(blog['writers'][p['author']]['name'])}</name></author>\n</entry>\n" for p in blog["posts"])
    out = {FEED: ('<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n'
                  f'<title>{e(name)} blog</title>\n<id>{origin}{INDEX}</id>\n<link rel="self" href="{origin}/{FEED}"/>\n'
                  f'<link rel="alternate" href="{origin}{INDEX}"/>\n<updated>{max(stamp(p) for p in blog["posts"])}</updated>\n'
                  + entries + "</feed>\n")}
    out.update({f"blog/{p['slug']}.md": made[f"blog/{p['slug']}/index.md"] for p in blog["posts"]})
    return out
