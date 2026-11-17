"""Site templates, step 3 (site-kit#119, superintelligentfoo#175): export a layout record as a WordPress block theme.

The theme is made from the same record, blocks and serializer as the static site, so the two can't drift apart in the
kit. The lead's ruling (2026-11-06): a theme only, with the pages' sections in its templates; nothing is imported as
posts. From install onward WordPress is the source: Site Editor changes are the site's own, and a re-export is only for
a fresh install.

    style.css                  the theme header (Requires at least: 6.3, for core/details)
    theme.json                 the brand's colours as the palette, so --wp--preset--color--<role> is what blocks.css
                               reads on both outputs; blocks.css itself as the theme's styles.css; the two template parts
    parts/header.html          the header and footer blocks, as on every static page
    parts/footer.html
    templates/front-page.html  the home page's sections
    templates/page-<slug>.html each other page's sections, by the last part of its path (WordPress's page-<slug>
                               template), with the page's title as its h1 when no section has one, as the static page does
    templates/404.html         an address with no page: a line and a way home
    templates/page.html        any other page: its title and its content
    templates/index.html       the fallback: the latest posts
    patterns/<id>.php          each section of the record as a pattern, so it can be inserted again from the inserter
    functions.php              fixed code, the same in every export: marks the menu link to the page being shown

The record is checked as for publishing, so a {{placeholder:...}} can't reach a theme. Images must have an https
address: a site path such as /assets/x.png exists on the static site, not in a WordPress install.

    python3 export.py .sitekit/layout.json .sitekit/brand.json --out theme-dir [--slug my-business]

Standard library only.
"""
import argparse
import json
import pathlib
import re
import sys

import layout
import render
import serialize

HERE = pathlib.Path(__file__).resolve().parent
SLUG = re.compile(r"^[a-z][a-z0-9-]{0,39}$")
PHP_UNSAFE = ("<?", "?>", "*/")   # nothing written into a .php file or a header comment may open or close one
# The theme's one piece of code, the same in every export (no value from the record goes into it). The menus are custom
# links (the export can't know WordPress's page ids), and WordPress marks only page-id links as current, so this marks
# the link to the page being shown, as the static page does: aria-current, which blocks.css also underlines (the
# designer on #135: the "you are here" cue is for screen readers too).
FUNCTIONS_PHP = """<?php
// site-kit site-templates: mark the menu link to the page being shown, as the static site does.
add_filter( 'render_block_core/navigation-link', function ( $html, $block ) {
	$url  = isset( $block['attrs']['url'] ) ? $block['attrs']['url'] : '';
	$here = trailingslashit( (string) wp_parse_url( isset( $_SERVER['REQUEST_URI'] ) ? $_SERVER['REQUEST_URI'] : '/', PHP_URL_PATH ) );
	if ( '' !== $url && $url === $here ) {
		$html = preg_replace( '/<a /', '<a aria-current="page" ', $html, 1 );
	}
	return $html;
}, 10, 2 );
"""
NOT_FOUND = ('<!-- wp:group {"tagName":"section"} --><section class="wp-block-group"><!-- wp:heading {"level":1} -->'
             '<h1 class="wp-block-heading">Page not found</h1><!-- /wp:heading --><!-- wp:paragraph --><p>There\'s no page at '
             'this address. It may have moved, or the link may be wrong.</p><!-- /wp:paragraph --><!-- wp:buttons -->'
             '<div class="wp-block-buttons"><!-- wp:button --><div class="wp-block-button"><a class="wp-block-button__link '
             'wp-element-button" href="/">Go to the home page</a></div><!-- /wp:button --></div><!-- /wp:buttons --></section>'
             '<!-- /wp:group -->')


def slug_of(name):
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40].strip("-")
    return s if SLUG.fullmatch(s) else "site-template"


def _safe_text(label, value):
    if any(m in value for m in PHP_UNSAFE) or layout.LINE_BREAK.search(value):
        raise layout.LayoutError(f"{label} {value!r} can't go into a theme header: no line break, '<?', '?>' or '*/'")
    return value


def _part(name, tag="div"):
    return f'<!-- wp:template-part {{"slug":"{name}","tagName":"{tag}"}} /-->'


def _main(inner):
    return f'<!-- wp:group {{"tagName":"main"}} --><main class="wp-block-group">{inner}</main><!-- /wp:group -->'


def _template(inner):
    return "\n".join([_part("header"), _main(inner), _part("footer")]) + "\n"


def _page_slug(path):
    return path.strip("/").rsplit("/", 1)[-1]


def _menus(markup, record):
    """Each navigation with its links written in, from the record's pages, so WordPress shows the same menu as the
    static page (not its fallback, every published page): home left out, and a page marked menu: footer only in the
    footer's menu. The label is HTML to WordPress (its filter keeps an <img src>), so the title goes in escaped, as text,
    the way the static page writes it (game-dev-3 on #135)."""
    def links(m):
        attrs = json.loads(m.group(1))
        header = attrs.get("menu") != "footer"
        inner = "".join("<!-- wp:navigation-link" + serialize._attrs({"label": serialize.escape(p["title"]), "url": p["path"], "kind": "custom",
                                                                      "isTopLevelLink": True}) + " /-->"
                        for p in record["pages"] if p["path"] != "/" and p.get("menu") != "none"
                        and not (header and p.get("menu") == "footer"))
        return f"<!-- wp:navigation {m.group(1)} -->{inner}<!-- /wp:navigation -->"
    return re.sub(r"<!-- wp:navigation (\{[^>]*?\}) /-->", links, markup)


def theme_json(brand_rec):
    render.tokens(brand_rec)   # the same check as the static page: each role a variable name, each value a hex colour
    palette = [{"slug": role, "color": hexv, "name": role.replace("-", " ").title()} for role, hexv in sorted(brand_rec["colours"].items())]
    out = {"$schema": "https://schemas.wp.org/wp/6.3/theme.json", "version": 2,
           "settings": {"appearanceTools": False, "useRootPaddingAwareAlignments": False,
                        "color": {"palette": palette, "defaultPalette": False, "defaultGradients": False, "defaultDuotone": False,
                                  "custom": False, "customGradient": False},
                        "layout": {"contentSize": "68rem", "wideSize": "68rem"}},
           "styles": {"spacing": {"blockGap": "0"}, "css": (HERE / "blocks.css").read_text(encoding="utf-8")},
           "templateParts": [{"name": "header", "title": "Header", "area": "header"},
                             {"name": "footer", "title": "Footer", "area": "footer"}]}
    render.look(brand_rec)   # the same check as the static page, so a band colour is a hex before it is written
    for name, band in sorted((brand_rec.get("bands") or {}).items()):   # the section bands' colours are palette roles too
        for k in (k for k in ("ground", "ink") if k in band):
            palette.append({"slug": f"band-{name}-{k}", "color": band[k], "name": f"Band {name} {k}".title()})
    _look(out, brand_rec)
    return out


def _look(out, brand_rec):
    """The brand's heading colour and font families in theme.json (site-kit#243); nothing is added for a brand without them.
    The font files and the header knobs are static-only: a theme is text, so the families are named with their fallback and
    the site's fonts load only where they are installed."""
    if "heading" in brand_rec["colours"]:
        out["styles"].setdefault("elements", {})["heading"] = {"color": {"text": "var(--wp--preset--color--heading)"}}
    fonts = brand_rec.get("fonts")
    if not fonts:
        return
    render.look(brand_rec)   # the same check as the static page: plain font names, each role a variable name
    out["settings"]["typography"] = {"fontFamilies": [
        {"slug": role, "name": role.title(), "fontFamily": f'"{f["family"]}"' + (f", {f['fallback']}" if f["fallback"].strip() else "")}
        for role, f in sorted(fonts.items())]}
    if "text" in fonts:
        out["styles"]["typography"] = {"fontFamily": "var(--wp--preset--font-family--text)"}
    if "display" in fonts:
        heading = out["styles"].setdefault("elements", {}).setdefault("heading", {})
        heading["typography"] = {"fontFamily": "var(--wp--preset--font-family--display)"}


def files(record, brand_rec, slug=None, now=None):
    """{theme path: text} for the whole theme; LayoutError, and nothing returned, if the record or brand can't be one.
    Dated sections (site-kit#383) are decided at `now`, as the static build decides them."""
    blocks = layout.load_blocks()
    types = json.loads(layout.PAGE_TYPES.read_text(encoding="utf-8"))
    found = layout.problems(record, blocks, types, publish=True, brand=brand_rec)
    if found:
        raise layout.LayoutError("the record is not ready to publish, so no theme was made:\n  " + "\n  ".join(found))
    record = layout.at(record, layout.build_time(publish=True) if now is None else now, blocks)   # a theme is always published
    slug = slug or slug_of(brand_rec["name"])
    if not SLUG.fullmatch(slug):
        raise layout.LayoutError(f"slug {slug!r} must be lowercase letters, digits and hyphens, starting with a letter")
    name = _safe_text("the brand name", brand_rec["name"])
    why = _safe_text("the why", record["why"])
    part = lambda n: _menus(serialize.section({"block": f"{n}@1", "props": {}}, blocks), record)   # noqa: E731
    out = {"style.css": (f"/*\nTheme Name: {name}\nDescription: {why}\nRequires at least: 6.3\nVersion: 1.0.0\n"
                         f"Text Domain: {slug}\n*/\n"),
           "theme.json": json.dumps(theme_json(brand_rec), indent=1, ensure_ascii=False) + "\n",
           "parts/header.html": part("header") + "\n", "parts/footer.html": part("footer") + "\n",
           "functions.php": FUNCTIONS_PHP, "templates/404.html": _template(NOT_FOUND),
           "templates/page.html": _template('<!-- wp:post-title {"level":1} /--><!-- wp:post-content /-->'),
           "templates/index.html": _template('<!-- wp:query --><div class="wp-block-query"><!-- wp:post-template -->'
                                             '<!-- wp:post-title {"isLink":true} /--><!-- wp:post-excerpt /-->'
                                             '<!-- /wp:post-template --></div><!-- /wp:query -->')}
    slugs = {}
    for p in record["pages"]:
        markup = serialize.page(record, p["path"], blocks, types, brand_rec)
        for src in re.findall(r'<img src="([^"]*)"', markup):
            if not src.startswith("https://"):
                raise layout.LayoutError(f"page {p['path']}: image {src} is a site path; a theme needs its https address")
        if p["path"] == "/":
            out["templates/front-page.html"] = _template(markup)
        else:
            s = _page_slug(p["path"])
            if s in slugs:
                raise layout.LayoutError(f"pages {slugs[s]} and {p['path']} would both be page-{s}.html in WordPress")
            slugs[s] = p["path"]
            title = "" if "<h1" in markup else '<!-- wp:post-title {"level":1} /-->'
            out[f"templates/page-{s}.html"] = _template(title + markup)
        for sec in p["sections"]:
            spec = blocks[sec["block"].partition("@")[0]]
            title = _safe_text("a page title", f"{p['title']}: {spec['title'].split(':')[0]}")
            out[f"patterns/{sec['id']}.php"] = (f"<?php\n/**\n * Title: {title}\n * Slug: {slug}/{sec['id']}\n"
                                                f" * Inserter: yes\n */\n?>\n{serialize.section(sec, blocks)}\n")
    for path, text in out.items():   # no value may start PHP in any file of the theme, not only the patterns
        if path == "functions.php":
            continue   # the kit's own fixed code, with nothing from the record in it
        body = text.split("?>\n", 1)[1] if path.endswith(".php") else text
        if "<?" in body:
            raise layout.LayoutError(f"{path} would contain '<?'")
    return out


def export(record, brand_rec, out, slug=None):
    """Write the theme to `out`; returns the paths written. Nothing is written if anything is refused."""
    theme = files(record, brand_rec, slug)
    out = pathlib.Path(out)
    for rel, text in theme.items():
        f = out / rel
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(text, encoding="utf-8")
    return sorted(theme)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("record")
    ap.add_argument("brand")
    ap.add_argument("--out", required=True)
    ap.add_argument("--slug")
    args = ap.parse_args(argv)
    try:
        record = json.loads(pathlib.Path(args.record).read_text(encoding="utf-8"))
        brand_rec = json.loads(pathlib.Path(args.brand).read_text(encoding="utf-8"))
        written = export(record, brand_rec, args.out, args.slug)
    except (OSError, ValueError) as e:
        print(f"export: cannot read ({e})", file=sys.stderr)
        return 1
    except layout.LayoutError as e:
        print(f"export: {e}", file=sys.stderr)
        return 1
    print(f"export: {len(written)} files written to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
