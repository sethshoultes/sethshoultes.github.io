"""Site templates, step 1c (site-kit#119, superintelligentfoo#175): ONE serializer, from the layout record to WordPress
core-block markup, and the static HTML as that same markup with the block comments taken out. That is how WordPress
itself renders a static block (its saved HTML is the block's output), so the static site and the block theme are one
text and cannot drift apart.

Every value goes through one escape function, the same for both outputs (game-dev-3 on #121: a heading of
"<img src=x onerror=...>" is valid text, so the serializer, not the validator, makes it harmless). A part whose value is
empty is left out (an optional lead not given, a button with no address), and a container left with nothing is left out
too. The dynamic parts site-title, site-logo and navigation are written as self-closing block comments; WordPress renders
them on its server, and to_html renders them from the same site data (the brand record and the pages). query (posts)
is refused until the templates have posts.

    python3 serialize.py .sitekit/layout.json /         the home page's block markup
    python3 serialize.py .sitekit/layout.json / --html  its static HTML

Standard library only. The record is checked with layout.problems first; nothing unchecked is serialized.
"""
import argparse
import html
import json
import pathlib
import re
import sys

import layout

COMMENT = re.compile(r"<!-- /?wp:[a-z][a-z0-9/-]*(?: \{.*?\})? /?-->")
DYNAMIC = {"site-title", "site-logo", "navigation"}
SLOT_CLASS = "site-kit-slot-"   # a slot group's class is this plus its name; the build finds and fills it by that
DYNAMIC_COMMENT = re.compile(r"<!-- wp:(site-title|site-logo|navigation)(?: (\{[^>]*?\}))? /-->")


def escape(text):
    """The one escape for text and attribute values, in both outputs."""
    return html.escape(text, quote=True)


def _attrs(d):
    """A block comment's JSON attributes, written the way WordPress writes them (no spaces, < > & escaped)."""
    if not d:
        return ""
    s = json.dumps(d, separators=(",", ":"), ensure_ascii=False)
    return " " + s.replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026").replace("--", "\\u002d\\u002d")


def _fill(value, props, item):
    """A field's text with every slot replaced by its prop's value (still unescaped)."""
    def one(m):
        name, sub, subsub = m.groups()
        if name == "item":
            v = (item or {}).get(sub)
            sub = subsub
        else:
            v = props.get(name)
        if isinstance(v, dict):
            v = v.get(sub, "")
        return v if isinstance(v, str) else ""
    return layout.SLOT.sub(one, value)


def _safe(kind, value):
    """An address checked here as well as by the validator (game-dev-2 on #123: section() is public, so the serializer
    must not trust that the record was checked). An unsafe one stops the build; it is never written."""
    ok = layout.SAFE_SRC.fullmatch(value) if kind == "src" else (layout.PAGE_HREF.fullmatch(value) or layout.SAFE_HREF.fullmatch(value))
    if not ok:
        raise layout.LayoutError(f"{kind} {value!r} is not a safe address, so it is not written")
    return value


def _wrap(name, inner, attrs=None):
    return f"<!-- wp:{name}{_attrs(attrs)} -->{inner}<!-- /wp:{name} -->"


def _inline(text):
    """A links-on text's HTML (site-kit#526): each plain run escaped, each [words](href) a link. With no link in it,
    exactly escape(text). The class is how the twin knows these links from a blog post's own (agents._md_linked)."""
    return "".join(escape(w) if h is None else f'<a class="sk-text-link" href="{escape(_safe("href", h))}">{escape(w)}</a>'
                   for w, h in layout.inline_parts(text))


def _linked(spec):
    """The paragraph slots whose prop or item field opts in to inline links: "{name}" and "{item.field}"."""
    out = set()
    for name, ps in spec["props"].items():
        if ps["type"] == "text" and ps.get("links"):
            out.add("{%s}" % name)
        for f, fs in ps.get("fields", {}).items() if ps["type"] == "items" else ():
            if fs["type"] == "text" and fs.get("links"):
                out.add("{item.%s}" % f)
    return frozenset(out)


def _node(node, props, item, anchor=None, kind=None, linked=frozenset()):
    """The markup of one tree node, or "" when it shows nothing. A section's outer group carries its id as `anchor` and
    its block's name as a class (`kind`), WordPress's own className: so a page's FAQ is class "faq" and its closing call
    to action "cta", which is how the site standard's faq-last check finds them."""
    part = node["part"]
    if part in DYNAMIC:   # rendered from the site's data: by WordPress, or by to_html(markup, site)
        # The attributes WordPress needs to render these as the static page does: the title a paragraph (core's default
        # is an h1, which would be a second h1 on every page), the logo at the static 48px, and the menu never folded
        # into a hamburger (step 3b's pixel diff, superintelligentfoo#175).
        attrs = {"site-title": {"level": 0}, "site-logo": {"width": 48}, "navigation": {"overlayMenu": "never"}}[part]
        attrs.update((k, v) for k, v in (("ariaLabel", node.get("label")), ("menu", node.get("where"))) if v)
        return f"<!-- wp:{part}{_attrs(attrs)} /-->"
    if part in layout.DYNAMIC_PARTS:
        raise layout.LayoutError(f"{part} needs content (posts) the templates do not have yet")
    f = lambda k: _fill(node[k], props, item) if k in node else ""   # noqa: E731
    if node.get("each"):
        return "".join(_node({k: v for k, v in node.items() if k != "each"}, props, it, linked=linked)
                       for it in props.get(node["each"], []) if isinstance(it, dict))
    kids = "".join(_node(k, props, item, linked=linked) for k in node.get("children", []))
    if part == "group":
        tag = node.get("tag", "div")
        # A plugin slot (site-kit#223) is an empty group that stays, named by one class: WordPress's className, so its
        # block validator accepts the saved markup (a data- attribute the group doesn't declare would fail it).
        slot = f("slot") if "slot" in node else None
        if slot is not None and not layout.SLOT_NAME.fullmatch(slot):
            raise layout.LayoutError(f"slot name {slot!r} is not 1 to 40 lowercase letters, digits and hyphens")
        picked = [f"sk-size-{item['size']}"] if isinstance(item, dict) and isinstance(item.get("size"), str) else []   # an item's choice (site-kit#243)
        names = " ".join(n for n in (kind, f"{SLOT_CLASS}{slot}" if slot else None, *picked) if n)
        attrs = {k: v for k, v in (("tagName", tag if tag != "div" else None), ("anchor", anchor), ("className", names)) if v}
        ident = f' id="{escape(anchor)}"' if anchor else ""
        cls = "wp-block-group" + (f" {escape(names)}" if names else "")
        return _wrap("group", f'<{tag}{ident} class="{cls}">{kids}</{tag}>', attrs or None) if kids or slot else ""
    if part == "columns":
        return _wrap("columns", f'<div class="wp-block-columns">{kids}</div>') if kids else ""
    if part == "column":
        size = f"sk-size-{item['size']}" if isinstance(item, dict) and isinstance(item.get("size"), str) else None   # an item's choice (site-kit#243)
        if size:
            return _wrap("column", f'<div class="wp-block-column {size}">{kids}</div>', {"className": size}) if kids else ""
        return _wrap("column", f'<div class="wp-block-column">{kids}</div>') if kids else ""
    if part == "buttons":
        return _wrap("buttons", f'<div class="wp-block-buttons">{kids}</div>') if kids else ""
    if part == "list":
        return _wrap("list", f'<ul class="wp-block-list">{kids}</ul>') if kids else ""
    if part == "gallery":
        return _wrap("gallery", f'<figure class="wp-block-gallery has-nested-images columns-default">{kids}</figure>',
                     {"linkTo": "none"}) if kids else ""
    if part == "heading":
        text, level = f("text"), node.get("level", 2)
        return _wrap("heading", f'<h{level} class="wp-block-heading">{escape(text)}</h{level}>',
                     {"level": level} if level != 2 else None) if text.strip() else ""
    if part == "paragraph":
        text = f("text")
        body = _inline(text) if node.get("text") in linked else escape(text)
        return _wrap("paragraph", f"<p>{body}</p>") if text.strip() else ""
    if part == "list-item":
        text = f("text")
        body = _inline(text) if node.get("text") in linked else escape(text)
        return _wrap("list-item", f"<li>{body}</li>") if text.strip() else ""
    if part == "image":
        src, alt, caption = f("src"), f("alt"), (f("caption") if "caption" in node else "")
        cap = f'<figcaption class="wp-element-caption">{escape(caption)}</figcaption>' if caption.strip() else ""   # site-kit#519
        return _wrap("image", f'<figure class="wp-block-image"><img src="{escape(_safe("src", src))}" alt="{escape(alt)}"/>{cap}</figure>') if src else ""
    if part == "button":
        text, href = f("text"), f("href")
        if not (text.strip() and href):
            return ""
        if layout.PLACEHOLDER.fullmatch(href):   # a starter's address still to fill: a button that goes nowhere yet
            return _wrap("button", f'<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" '
                                   f'aria-disabled="true">{escape(text)}</a></div>')
        if node.get("newtab"):   # site-kit#435: opens in a new tab, and the page it opens gets no window.opener
            return _wrap("button", f'<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" '
                                   f'href="{escape(_safe("href", href))}" target="_blank" rel="noreferrer noopener">{escape(text)}</a></div>',
                         {"linkTarget": "_blank", "rel": "noreferrer noopener"})
        return _wrap("button", f'<div class="wp-block-button"><a class="wp-block-button__link wp-element-button" '
                               f'href="{escape(_safe("href", href))}">{escape(text)}</a></div>')
    if part == "details":
        summary = f("summary")
        return _wrap("details", f'<details class="wp-block-details"><summary>{escape(summary)}</summary>{kids}</details>') \
            if summary.strip() and kids else ""
    if part == "quote":
        stars = ""
        if isinstance(item, dict) and isinstance(item.get("stars"), int) and not isinstance(item.get("stars"), bool):   # a rating (site-kit#243)
            n = item["stars"]
            stars = _wrap("paragraph", f'<p class="sk-stars"><span aria-hidden="true">{"★" * n}{"☆" * (5 - n)}</span>'
                                       f'<span class="sk-sr">Rated {n} out of 5</span></p>', {"className": "sk-stars"})
        kids = stars + kids
        cite = f("cite")
        tail = f"<cite>{escape(cite)}</cite>" if cite.strip() else ""
        return _wrap("quote", f'<blockquote class="wp-block-quote">{kids}{tail}</blockquote>') if kids else ""
    raise layout.LayoutError(f"no serializer for {part}")   # the allowlist and this list must stay one list


def section(sec, blocks, run=()):
    """One section's block markup. `run` is the card run's ends this section is (sk-card-open, sk-card-close)."""
    spec = blocks[sec["block"].partition("@")[0]]
    kind = spec["name"] if sec.get("id") else None
    tree = spec["tree"]
    for prop, ps in spec["props"].items():   # site-kit#243: a set choice or flag is one more class on the section, and only a set one
        v = sec["props"].get(prop)
        cls = f"sk-{prop}-{v}" if ps["type"] == "choice" and v else f"sk-{prop}" if ps["type"] == "flag" and v is True else \
            f"sk-{prop} sk-{prop}-{v}" if ps["type"] == "flag" and isinstance(v, str) else None
        if cls:
            kind = f"{kind} {cls}" if kind else cls
    if spec["name"] == "hero" and sec["props"].get("logo") in (True, "large"):   # the brand logo, large, leads the hero's first column
        tree = json.loads(json.dumps(tree))
        col = tree["children"][0]["children"][0]
        col["children"].insert(0, {"part": "site-logo"})
    if spec["name"] == "hero" and sec["props"].get("menu") is True:   # the site menu, under the hero's tagline
        tree = json.loads(json.dumps(tree))
        col = tree["children"][0]["children"][0]
        at = next(i for i, c in enumerate(col["children"]) if c.get("text") == "{lead}") + 1   # right under the tagline, by name
        col["children"].insert(at, {"part": "navigation", "label": "Main", "where": "header"})
    if sec.get("band"):   # site-kit#243: the band is one more class on the section's group, and only a banded section has it
        if sec["band"] not in layout.BANDS:
            raise layout.LayoutError(f"band {sec['band']!r} is not light, dark or card")
        kind = f"{kind} sk-band-{sec['band']}" if kind else f"sk-band-{sec['band']}"
        for end in run:
            kind += " " + end
    props = {k: layout.prefill_links(v) if spec["props"].get(k, {}).get("type") == "prefill" and isinstance(v, str) else v
             for k, v in sec["props"].items()}   # site-kit#435: a prefill is used by its parts, the links made here
    return _node(tree, props, None, sec.get("id"), kind, _linked(spec))


def page(record, path, blocks, page_types, brand=None):
    """The block markup of one page of a VALID record (LayoutError otherwise)."""
    found = layout.problems(record, blocks, page_types, brand=brand)
    if found:
        raise layout.LayoutError("the record is not valid:\n  " + "\n  ".join(found))
    for p in record["pages"]:
        if p["path"] == path:
            cards = [s.get("band") == "card" for s in p["sections"]]   # consecutive card sections share one card (site-kit#243)
            ends = lambda i: [e for e, edge in (("sk-card-open", i == 0 or not cards[i - 1]),   # noqa: E731
                                                ("sk-card-close", i == len(cards) - 1 or not cards[i + 1])) if cards[i] and edge]
            return "\n".join(section(s, blocks, ends(i)) for i, s in enumerate(p["sections"]))
    raise layout.LayoutError(f"no page {path}")


def _footer_note(site):
    """site-kit#424: the footer's one line of small print, after its links, as text; no note writes nothing."""
    return f'<p class="sk-footer-note">{escape(site["footer_note"])}</p>' if site.get("footer_note") else ""


def _footer_family(site):
    """site-kit#428: the Super Intelligent family's row after the footer's links, the site it is on marked and not linked."""
    if not site.get("family"):
        return ""
    # aria-current="true", not "page": the row names this site, not the page a reader is on (the designer on key-site#15).
    items = "".join(f'<li><span aria-current="true">{escape(s["name"])}</span></li>' if s["current"]
                    else f'<li><a href="{escape(s["url"])}">{escape(s["name"])}</a></li>' for s in site["family"])
    return f'<nav class="sk-footer-family" aria-label="The Super Intelligent family"><p>Family:</p><ul>{items}</ul></nav>'


def _dynamic(part, site, current, attrs=None):
    """What WordPress's server renders for a dynamic part, from the same site data (the accepted, named difference)."""
    banner = site.get("header")   # a brand header image (site-kit#243) stands where the logo and the name would
    if part == "navigation" and site.get("no_menu") and (attrs or {}).get("menu") != "footer":   # the page's hero carries the menu
        return ""
    if part == "navigation" and site.get("footer_cols") and (attrs or {}).get("menu") == "footer" and site.get("footer_row"):
        # trenzbarbershop#34: one centred row of every column's links, in order; the headings are left out
        row = "".join(f'<li class="wp-block-navigation-item"><a class="wp-block-navigation-item__content" href="{escape(href)}">{escape(label)}</a></li>'
                      for _, links in site["footer_cols"] for label, href in links)
        return (f'<nav class="wp-block-navigation sk-footer-row" aria-label="{escape((attrs or {}).get("ariaLabel") or site["name"])}">'
                f'<ul class="wp-block-navigation__container">{row}</ul></nav>' + _footer_note(site) + _footer_family(site))
    if part == "navigation" and site.get("footer_cols") and (attrs or {}).get("menu") == "footer":   # the record's own footer columns
        cols = "".join(f'<div class="sk-footer-col"><p class="sk-footer-heading"><strong>{escape(h)}</strong></p><ul class="wp-block-navigation__container">'
                       + "".join(f'<li class="wp-block-navigation-item"><a class="wp-block-navigation-item__content" href="{escape(href)}">{escape(label)}</a></li>'
                                 for label, href in links) + "</ul></div>" for h, links in site["footer_cols"])
        return f'<nav class="wp-block-navigation sk-footer-columns" aria-label="{escape((attrs or {}).get("ariaLabel") or site["name"])}">{cols}</nav>' + _footer_note(site) + _footer_family(site)
    if banner and part == "site-title":
        return ""
    if part == "site-title" and site.get("no_logo"):   # the page's hero shows the logo, so the header drops its name as well
        return ""
    if part == "site-logo" and site.get("no_logo") and not banner:   # the page's hero shows the logo, so the header leaves it out
        return ""
    if banner and part == "site-logo":
        size = f' width="{banner["width"]}" height="{banner["height"]}"' if "width" in banner else ""
        return (f'<div class="sk-header-banner"><a href="/" rel="home"><img src="{escape(banner["src"])}" '
                f'alt="{escape(banner["alt"])}"{size}/></a></div>')
    if part == "site-title" and site.get("wordmark"):   # key-site#18: lead over emphasis; it reads as the name, words in order
        lead, emphasis = site["wordmark"]
        return (f'<p class="wp-block-site-title sk-title-stacked"><a href="/" rel="home"><span class="sk-title-lead">{escape(lead)}</span> '
                f'<span class="sk-title-emphasis">{escape(emphasis)}</span></a></p>')
    if part == "site-title":
        return f'<p class="wp-block-site-title"><a href="/" rel="home">{escape(site["name"])}</a></p>'
    if part == "site-logo":
        return (f'<div class="wp-block-site-logo"><a href="/" rel="home" class="custom-logo-link">'
                f'<img src="{escape(site["logo"])}" alt="{escape(site["name"])}" class="custom-logo" width="48" height="48"/></a></div>')
    attrs = attrs or {}
    header = attrs.get("menu") != "footer"   # a page marked menu: footer shows in the footer's menu only
    if header and site.get("menu"):   # the record's own menu entries replace the pages-derived header menu (site-kit#243)
        # members' sign-in link (site-kit#601) is marked, so a look can keep its own last-item style off it
        items = "".join('<li class="wp-block-navigation-item' + (' sk-nav-sign-in' if href == layout.SIGN_IN else "")
                        + '"><a class="wp-block-navigation-item__content" '
                        + ('aria-disabled="true"' if layout.PLACEHOLDER.fullmatch(href) else f'href="{escape(href)}"')   # a starter's address still to fill (site-kit#349)
                        + (' aria-current="page"' if href == current else "") + f">{escape(label)}</a></li>" for label, href in site["menu"])
        label = attrs.get("ariaLabel") or site["name"]
        return f'<nav class="wp-block-navigation" aria-label="{escape(label)}"><ul class="wp-block-navigation__container">{items}</ul></nav>'
    items = "".join(f'<li class="wp-block-navigation-item"><a class="wp-block-navigation-item__content" href="{escape(path)}"'
                    + (' aria-current="page"' if path == current else "") + f">{escape(title)}</a></li>"
                    for path, title, menu in site["pages"] if menu != "none" and not (header and menu == "footer"))
    label = attrs.get("ariaLabel") or site["name"]
    return f'<nav class="wp-block-navigation" aria-label="{escape(label)}"><ul class="wp-block-navigation__container">{items}</ul></nav>'


def to_html(markup, site=None, current=None):
    """The static HTML: the block markup with its block comments taken out, as WordPress renders a static block. The
    dynamic parts (site title, logo, navigation) are rendered from `site` ({"name", "logo", "pages": [(path, title)]})."""
    if DYNAMIC_COMMENT.search(markup):
        if site is None:
            raise layout.LayoutError("this markup has dynamic parts, so its HTML needs the site's data")
        markup = DYNAMIC_COMMENT.sub(lambda m: _dynamic(m.group(1), site, current, json.loads(m.group(2)) if m.group(2) else None), markup)
    return COMMENT.sub("", markup)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("record")
    ap.add_argument("path")
    ap.add_argument("--html", action="store_true")
    args = ap.parse_args(argv)
    try:
        record = json.loads(pathlib.Path(args.record).read_text(encoding="utf-8"))
        markup = page(record, args.path, layout.load_blocks(), json.loads(layout.PAGE_TYPES.read_text(encoding="utf-8")))
    except (OSError, ValueError) as e:
        print(f"serialize: cannot read ({e})", file=sys.stderr)
        return 1
    except layout.LayoutError as e:
        print(f"serialize: {e}", file=sys.stderr)
        return 1
    print(to_html(markup) if args.html else markup)
    return 0


if __name__ == "__main__":
    sys.exit(main())
