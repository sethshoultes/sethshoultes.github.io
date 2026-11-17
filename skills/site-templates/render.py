"""Site templates, step 1d (site-kit#119, superintelligentfoo#175): the static page shell around a page's sections.

One page of a valid layout record becomes a whole HTML document: its head (title, description, canonical, Open Graph,
the icons from the brand record), the brand's colours as the same custom properties WordPress's theme.json makes
(--wp--preset--color--<role>), so one stylesheet serves both outputs, and the header and footer template parts (the
logo, the site's name and the menu of its pages) around the page's own sections. The page's HTML is serialize.to_html
of its block markup, so it stays the same text as the block theme.

    python3 render.py .sitekit/layout.json .sitekit/brand.json / --origin https://example.com [--css /assets/blocks.css]

The stylesheet for the core blocks is the one open choice (asked of the lead: WordPress's own block-library CSS, or a
small one of our own), so the shell links whatever --css names and nothing otherwise. Standard library only.
"""
import argparse
import importlib.util
import json
import pathlib
import re
import sys

import layout
import serialize

BRAND = pathlib.Path(__file__).resolve().parent.parent / "brand" / "brand.py"
_spec = importlib.util.spec_from_file_location("brand", BRAND)
brand = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(brand)

ORIGIN = re.compile(r"^https://[a-z0-9-]+(?:\.[a-z0-9-]+)+$")
ROLE = re.compile(r"^[a-z][a-z0-9-]{0,30}$")


SHARE_EXT = {".png": "png", ".jpg": "jpg", ".jpeg": "jpg", ".webp": "webp"}


def web_names(brand_rec):
    """{repo path: the fixed name it is served under}. Fixed names, never the source's own, so a brand file can never
    land on a page's address (the security review on step 1e: an icon named index.html would have replaced a page)."""
    ext = SHARE_EXT.get(pathlib.PurePosixPath(brand_rec["share_image"]).suffix.lower())
    if ext is None:
        raise layout.LayoutError("share_image must be a .png, .jpg or .webp")
    if set(brand_rec["icons"]) != set(brand.ICONS):   # game-dev-3 on #125: a key like "x/../../pwned" became a path
        raise layout.LayoutError(f"icons must have exactly the keys {', '.join(brand.ICONS)}")
    pairs = [(brand_rec["icons"][k], "favicon.ico" if k == "ico" else f"icon-{k}.png") for k in brand.ICONS]
    pairs.append((brand_rec["share_image"], f"share.{ext}"))
    header = brand_rec.get("header") or {}
    if "image" in header:   # site-kit#243: only a site that sets a header image gets this file
        hext = SHARE_EXT.get(pathlib.PurePosixPath(str(header["image"])).suffix.lower())
        if hext is None:
            raise layout.LayoutError("header.image must be a .png, .jpg or .webp")
        pairs.append((header["image"], f"header.{hext}"))
    names = dict(pairs)
    if len(names) != len(pairs):   # one file named for two slots would silently drop one of them
        raise layout.LayoutError("each brand file must be a different file (one icon or image per slot)")
    return names


def _web(path, brand_rec):
    return "/" + web_names(brand_rec)[path]


def site_data(record, brand_rec):
    pages = [(p["path"], p["title"], p.get("menu", "both")) for p in record["pages"] if p["path"] != "/"]   # the logo and name link home
    out = {"name": brand_rec["name"], "logo": _web(brand_rec["icons"]["192"], brand_rec), "pages": pages}
    if (brand_rec.get("header") or {}).get("nav_home") and "menu" not in record:   # site-kit#243: Home first in the menu
        out["pages"] = [("/", "Home", "both")] + pages
    if "footer" in record:   # the record's footer columns replace the footer menu
        out["footer_cols"] = [(c["heading"], [(l["label"], l["href"]) for l in c["links"]]) for c in record["footer"]["columns"]]
        out["footer_row"] = record["footer"].get("layout") == "row"
        out["footer_note"] = record["footer"].get("note")   # site-kit#424: one line of small print after the links
    if "menu" in record:   # the record's own entries replace the pages-derived header menu
        out["menu"] = [(m["label"], m["href"]) for m in record["menu"]]
    return out


#: preview-feedback's colour slots (site-kit#294), each read from the brand role every starter names that way. The brand
#: check already pairs ink with ground and accent with on-accent for the site itself, so the frame reuses those pairs.
PF_ROLES = (("accent", "accent"), ("on-accent", "on-accent"), ("bg", "ground"), ("ink", "ink"), ("muted", "muted"),
            ("line", "muted"))


def tokens(brand_rec):
    """The brand's colours as theme.json's own variables, so static CSS and the block theme use one set of names, then
    preview-feedback's --pf-* colours from them (site-kit#294) in a :root of their own. Those are the hex itself, never
    var(): the frame reads them with getComputedStyle, which returns the declared text unresolved. A role the brand
    lacks writes nothing, so the frame keeps its own default there; live pages never load preview-feedback."""
    lines = []
    for role, hexv in sorted(brand_rec["colours"].items()):
        if not ROLE.fullmatch(role):
            raise layout.LayoutError(f"colour role {role!r} cannot be a variable name (lowercase letters, digits, hyphens)")
        # game-dev-3 on #124: the value goes into a <style> too, so it must be a hex colour and nothing else, even when
        # document() is called with a record that skipped brand.check.
        if not (isinstance(hexv, str) and brand.HEX.fullmatch(hexv)):   # fullmatch: no trailing newline (game-dev-2 on #124)
            raise layout.LayoutError(f"colour {role!r} must be a #rgb or #rrggbb hex")
        lines.append(f"--wp--preset--color--{role}:{hexv}")
    colours = brand_rec["colours"]   # every value held to a hex colour above
    pf = [f"--pf-{slot}:{colours[role]}" for slot, role in PF_ROLES if role in colours]
    return ":root{" + ";".join(lines) + "}" + (":root{" + ";".join(pf) + "}" if pf else "")


FONT_KIND = {".woff2": "woff2", ".woff": "woff", ".ttf": "truetype", ".otf": "opentype"}


def font_names(brand_rec):
    """[(repo path, the fixed name it is served under)] for every font face (site-kit#243): fonts/<role>-<n>.<ext>, never the
    source's own name, as web_names does for icons. Empty without `fonts`, and for a system stack (`faces: []`)."""
    out = []
    for role, f in sorted((brand_rec.get("fonts") or {}).items()):
        if not ROLE.fullmatch(role):
            raise layout.LayoutError(f"font role {role!r} cannot be a variable name (lowercase letters, digits, hyphens)")
        for n, face in enumerate(f["faces"]):
            ext = pathlib.PurePosixPath(str(face["file"])).suffix.lower()
            if ext not in FONT_KIND:
                raise layout.LayoutError(f"fonts.{role}: {face['file']!r} must be a {', '.join(FONT_KIND)} file")
            out.append((face["file"], f"fonts/{role}-{n}{ext}"))
    return out


USES = ("sk-layout-stacked", "sk-logo", "sk-logo-large", "sk-style-link", "sk-title_size-small", "sk-size-small", "sk-size-medium", "sk-cta_style-link", "sk-style-dark", "sk-style-quote", "sk-stars", "sk-menu", "sk-footer-columns", "sk-footer-row")   # the classes a section of this page may carry, each with its rule in look()


# One step down the heading scale (blocks.css sets h1 2rem-3rem, h2 1.6rem-1.9rem, h3 1.25rem); fixed here, in the conditional
# style, so blocks.css and every unset site stay byte for byte as they were.
SCALE_DOWN = {"h1": "font-size:clamp(1.6rem,4vw,2.25rem)", "h2": "font-size:clamp(1.35rem,2.5vw,1.6rem)", "h3": "font-size:1.1rem"}


def _rgb(hexv):
    h = hexv.lstrip("#")
    h = "".join(c * 2 for c in h) if len(h) == 3 else h
    return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]


def luminance(hexv):
    """WCAG relative luminance of a #rgb or #rrggbb colour."""
    r, g, b = (c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4 for c in _rgb(hexv))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def card_ink(brand_rec):
    """The text colour a card on `colours.surface` sets for itself, or None when the page's ink already reads on it (so a page
    whose ink is dark on a light surface renders as it did): the light band's ink if the brand defines one, else the page ink
    when it contrasts 4.5:1, else black or white by the surface's luminance."""
    colours, surface = brand_rec["colours"], brand_rec["colours"]["surface"]
    light = (brand_rec.get("bands") or {}).get("light")
    if light:
        return light["ink"]
    if "ink" in colours and contrast(colours["ink"], surface) >= 4.5:
        return None
    return "#000000" if luminance(surface) > 0.179 else "#ffffff"


def card_links(scope, brand_rec, same=True):
    """Links and outlined buttons inside a card: kept as they are while the accent reads on the surface (filled buttons keep their
    own accent / on-accent pair either way), else they take the card's ink, links underlined."""
    colours = brand_rec["colours"]
    if "accent" not in colours or contrast(colours["accent"], colours["surface"]) >= 4.5:
        return ""
    ink = card_ink(brand_rec) or colours["ink"]
    at = scope if same else scope + " "   # a band card is the section itself; main holds the sections
    return (f"{scope} a:not(.wp-block-button__link){{color:{ink};text-decoration:underline}}"
            f"{at}.services>.wp-block-buttons .wp-block-button__link,{at}.work>.wp-block-buttons .wp-block-button__link,"
            f"{at}.contact .wp-block-button + .wp-block-button .wp-block-button__link{{color:{ink}}}")


def look(brand_rec, bands_used=(), uses=()):
    """The site's look (site-kit#243) as one <style> for the head, after the stylesheet link so it wins: fonts, the heading
    colour and the header knobs, all from brand.json. [] when the record sets none of them, so such a page is exactly what
    it was. Every value is held to the brand check's shapes here too, as colours are in tokens()."""
    rules = []
    fonts = brand_rec.get("fonts")
    if fonts:
        names, faces, props = font_names(brand_rec), [], []
        by_file = iter(names)
        for role, f in sorted(fonts.items()):
            if not (brand.FONT_FAMILY.fullmatch(f["family"]) and brand.FONT_FALLBACK.fullmatch(f["fallback"])):
                raise layout.LayoutError(f"fonts.{role}: family and fallback must be plain font names")
            for face in f["faces"]:
                if not (brand.FONT_WEIGHT.fullmatch(face["weight"]) and brand.FONT_STYLE.fullmatch(face["style"])):
                    raise layout.LayoutError(f"fonts.{role}: a face's weight or style is not a CSS value")
                name = next(by_file)[1]
                faces.append(f'@font-face{{font-family:"{f["family"]}";src:url(/{name}) format("{FONT_KIND[pathlib.PurePosixPath(name).suffix]}");'
                             f'font-weight:{face["weight"]};font-style:{face["style"]};font-display:swap}}')
            props.append(f'--sk-font-{role}:"{f["family"]}"' + (f",{f['fallback']}" if f["fallback"].strip() else ""))
        rules += faces + [":root{" + ";".join(props) + "}"]
        if "display" in fonts:
            rules.append("h1,h2,h3,h4,h5,h6,.wp-block-site-title,.wp-block-navigation{font-family:var(--sk-font-display)}")
        if "text" in fonts:
            rules.append("body{font-family:var(--sk-font-text,system-ui,sans-serif)}")
    if "heading" in brand_rec["colours"]:   # tokens() has already held its value to a hex colour
        rules.append(":is(h1,h2,h3,h4,h5,h6):not(.cta *){color:var(--wp--preset--color--heading)}")
    panels = brand_rec.get("panels")
    if panels:   # site-kit#415: comic panels (Foo's family look): a 3px ink border, a hard offset shadow, square corners
        if panels.get("style") != "comic" or panels.get("shadow") not in brand_rec["colours"] or not ROLE.fullmatch(panels["shadow"]):
            raise layout.LayoutError('panels must be {"style": "comic", "shadow": a role of the brand\'s colours}')
        shadow = f"var(--wp--preset--color--{panels['shadow']})"   # a role name tokens() has held to ROLE
        rules.append("main .wp-block-image img,.work .wp-block-image img,.services .wp-block-column,main .wp-block-button__link,.wp-block-details"
                     f"{{border:3px solid var(--st-ink);border-radius:0;box-shadow:6px 6px 0 {shadow}}}"
                     # a picture gets the comic gutter: a ground-coloured gap inside the ink, so the line shows against dark art
                     # and a part-pixel column width never shows the page through as a hairline (designer on key-site#5)
                     "main .wp-block-image img,.work .wp-block-image img{padding:4px;background:var(--st-ground);box-sizing:border-box}"
                     ".services .wp-block-column{background:var(--st-ground)}"
                     ".wp-block-details,.wp-block-details:last-of-type{padding:0 1rem;margin:0 0 1rem}"
                     ".cta .wp-block-button__link{border-color:var(--st-on-accent)}")
    header = brand_rec.get("header") or {}
    if "image" in header or header.get("align") == "center":
        rules.append("header .wp-block-columns{flex-direction:column;align-items:stretch}"
                     "header .wp-block-column{flex:0 0 auto!important;flex-basis:auto!important;width:100%}")
    if "image" in header:
        # "compact" (superintelligentfoo#1028): a lockup, not a photo; it keeps its shape at a capped height, left-aligned,
        # instead of filling the content width (a 1600x633 lockup was 430px tall at 1280).
        img = ("width:auto;max-width:100%;height:auto;max-height:clamp(8.5rem,16vw,12rem)" if header.get("image_size") == "compact"
               else "width:100%;height:auto")
        rules.append(".sk-header-banner{width:100%}.sk-header-banner a{display:block}"
                     f".sk-header-banner img{{display:block;{img}}}")
        if header.get("image_size") == "compact" and header.get("align") != "center":
            # site-kit#374: from 782px (where WordPress core stops stacking columns, maint-review-2 on #375) a compact lockup and the menu share one row, the lockup at its own width and
            # capped at 120px, the menu filling the rest; at phone width they stay stacked. A centred header stays a column.
            rules.append("@media (min-width:782px){header .wp-block-columns{flex-direction:row;flex-wrap:nowrap!important;align-items:center}"
                         "header .wp-block-column{width:auto}"
                         "header .wp-block-column:first-child{flex:0 1 auto!important}"
                         "header .wp-block-column:last-child{flex:1 1 auto!important}"
                         ".sk-header-banner{width:auto}.sk-header-banner img{max-height:7.5rem}}")
    if header.get("align") == "center":
        rules.append("header .wp-block-columns{align-items:center;text-align:center}"
                     ".wp-block-site-logo{margin-inline:auto}"
                     "header .wp-block-navigation__container{justify-content:center}"
                     "@media (min-width:48rem){header .wp-block-column:last-child{justify-content:center}}")
    if header.get("nav_align") == "left":
        if "image" not in header:
            rules.append("header .wp-block-columns{flex-direction:column;align-items:stretch}"
                         "header .wp-block-column{flex:0 0 auto!important;flex-basis:auto!important;width:100%}")
        rules.append("header .wp-block-navigation__container{justify-content:flex-start}"
                     "@media (min-width:48rem){header .wp-block-column:last-child{justify-content:flex-start}}")
    if header.get("nav_current") == "bar":
        rules.append(".wp-block-navigation a.wp-block-navigation-item__content[aria-current=\"page\"]{text-decoration:none;box-shadow:inset 0 -4px 0 var(--st-accent)}")
    if header.get("nav_style") == "muted":
        rules.append("header .wp-block-navigation a.wp-block-navigation-item__content,main .wp-block-navigation a.wp-block-navigation-item__content"
                     "{color:var(--wp--preset--color--muted,var(--st-muted));font-weight:400}"
                     "header .wp-block-navigation a.wp-block-navigation-item__content[aria-current=\"page\"],"
                     "main .wp-block-navigation a.wp-block-navigation-item__content[aria-current=\"page\"]{color:inherit}")   # the text's own colour (a band's too), the accent its mark (site-kit#370)
    if header.get("nav_case") == "upper":
        rules.append(".wp-block-navigation a.wp-block-navigation-item__content{text-transform:uppercase}")
    if header.get("logo_size") == "large" and "image" not in header:   # a banner replaces the logo
        rules.append(".wp-block-site-logo img{width:96px;height:96px}")
    if brand_rec.get("main") == "card":   # the brand check requires colours.surface; tokens() has held it to a hex colour
        if "surface" not in brand_rec["colours"]:
            raise layout.LayoutError('main "card" needs colours.surface')
        ink = card_ink(brand_rec)
        rules.append("main{background:var(--wp--preset--color--surface);width:100%;max-width:var(--st-width,68rem);margin:1.5rem auto;padding:1rem 1.5rem"
                     + (f";color:{ink}" if ink else "") + "}" + card_links("main", brand_rec, same=False))
        if header.get("in_card"):   # the header opens the same card: it takes the top, main loses its top margin, the footer stays outside
            rules.append("header.wp-block-group{background:var(--wp--preset--color--surface);width:100%;max-width:var(--st-width,68rem);"
                         "margin:1.5rem auto 0;padding-inline:1.5rem" + (f";color:{ink}" if ink else "") + "}main{margin-top:0}"
                         + card_links("header", brand_rec, same=False))
    if "card" in bands_used:   # a surface on its own styles nothing: only a section that asks for the card gets the rule
        ink = card_ink(brand_rec)
        strip = (brand_rec.get("bands") or {}).get("card", {}).get("ground")   # the strip behind the card, or the page's ground
        edge = strip or "var(--st-ground)"
        rules.append(".sk-band-card{background:var(--wp--preset--color--surface);background-clip:padding-box;width:100%;max-width:var(--st-width,68rem);"
                     "margin:0 auto;padding-inline:1.5rem" + (f";color:{ink}" if ink else "")
                     + (f";box-shadow:0 0 0 100vmax {strip};clip-path:inset(0 -100vmax)" if strip else "") + "}"
                     f".sk-card-open{{border-top:1rem solid {edge}}}.sk-card-close{{border-bottom:1rem solid {edge}}}"
                     ".sk-band-card:not(.sk-card-open){margin-top:-1px}"   # sections of one card overlap a pixel, so no hairline shows at a seam
                     + card_links(".sk-band-card", brand_rec))
    fband = (brand_rec.get("footer") or {}).get("band")
    if fband is not None:   # the footer takes that band's ground and ink, as a section does
        band = (brand_rec.get("bands") or {}).get(fband) if fband in ("light", "dark") else None
        if not isinstance(band, dict) or not all(
                isinstance(band.get(k), str) and brand.HEX.fullmatch(band[k]) for k in ("ground", "ink")):
            raise layout.LayoutError(f"footer.band {fband!r} must name a light or dark band the brand defines")
        rules.append(f"footer.wp-block-group{{background:{band['ground']};color:{band['ink']};border-top-color:transparent}}"
                     f"footer.wp-block-group .wp-block-site-title a{{color:inherit}}")
    headings = brand_rec.get("headings") or {}
    if headings.get("size") == "small":
        rules.append("h1.wp-block-heading,.wp-block-post-title{" + SCALE_DOWN["h1"] + "}h2.wp-block-heading{" + SCALE_DOWN["h2"]
                     + "}h3.wp-block-heading{" + SCALE_DOWN["h3"] + "}")
    if headings.get("case") == "upper":
        rules.append(".wp-block-heading,.wp-block-post-title{text-transform:uppercase}")
    if brand_rec.get("text_align") == "center":
        rules.append("main{text-align:center}main .wp-block-buttons{justify-content:center}.wp-block-quote{border-left:0;padding-left:0}")
    if "sk-layout-stacked" in uses:
        rules.append(".sk-layout-stacked .wp-block-columns{flex-direction:column;align-items:center;text-align:center}"
                     ".sk-layout-stacked .wp-block-column{flex:0 0 auto!important;flex-basis:auto!important;width:100%}"
                     ".sk-layout-stacked .wp-block-buttons{justify-content:center}.sk-layout-stacked p{margin-inline:auto}")
    if "sk-logo" in uses:
        rules.append(".sk-logo .wp-block-site-logo{margin-inline:auto}.sk-logo .wp-block-site-logo img{width:160px;height:160px}")
    if "sk-logo-large" in uses:
        rules.append(".sk-logo-large .wp-block-site-logo{width:min(22rem,100%)}.sk-logo-large .wp-block-site-logo img{width:100%;height:auto}")
    if "sk-title_size-small" in uses:
        rules.append(f".sk-title_size-small h1.wp-block-heading{{{SCALE_DOWN['h1']}}}")
    for size, width in (("small", "17rem"), ("medium", "34rem")):   # a quarter and half of the 68rem content width; full width on a phone
        if f"sk-size-{size}" in uses:
            rules.append(f".sk-size-{size} .wp-block-image{{max-width:{width};margin-inline:auto}}.sk-size-{size} .wp-block-image img{{width:100%}}")
    if "sk-style-dark" in uses:
        rules.append(".sk-style-dark .wp-block-button__link{background:var(--st-ink);color:var(--st-ground)}")
        colours, bands = brand_rec["colours"], brand_rec.get("bands") or {}
        pairs = []   # a dark button on a light surface stays dark with light text: the surface's own ink on the surface
        if "surface" in colours:
            pairs.append(((".sk-band-card.sk-style-dark", "main .sk-style-dark") if brand_rec.get("main") == "card" else (".sk-band-card.sk-style-dark",),
                          card_ink(brand_rec) or colours["ink"], colours["surface"]))
        for name in ("light", "dark"):
            if name in bands:
                pairs.append(((f".sk-band-{name}.sk-style-dark",), bands[name]["ink"], bands[name]["ground"]))
        for sels, bg, fg in pairs:
            rules.append(",".join(f"{s} .wp-block-button__link" for s in sels) + f"{{background:{bg};color:{fg}}}")
    if "sk-style-quote" in uses:
        rules.append(".sk-style-quote .wp-block-quote{border-left:0;padding-left:0;text-align:center}"
                     ".sk-style-quote .wp-block-quote p{font-family:var(--sk-font-display,inherit);font-style:italic}")
    if "sk-stars" in uses:
        rules.append(".sk-stars{margin:0 0 .5rem;color:var(--st-accent);letter-spacing:.1em}"
                     ".sk-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}")
    if "sk-menu" in uses:
        rules.append(".sk-menu .wp-block-navigation{margin:1rem 0}")
        if brand_rec.get("text_align") == "center":   # a centred site centres the hero's menu too, wrapping as a centred row
            rules.append(".sk-menu .wp-block-navigation__container{justify-content:center}")
        if "sk-layout-stacked" in uses:
            rules.append(".sk-layout-stacked.sk-menu .wp-block-navigation__container{justify-content:center}")
    if "sk-footer-columns" in uses:
        rules.append(".sk-footer-columns{display:flex;flex-wrap:wrap;gap:1.5rem 3rem}.sk-footer-col p{margin:0 0 .25rem}"
                     ".sk-footer-columns .wp-block-navigation__container{flex-direction:column;gap:0}")
    if "sk-footer-row" in uses:   # trenzbarbershop#34: every footer link in one centred row, wrapping on a phone
        # trenzbarbershop#37 (designer read): the footer's brand line centres over the row too, and the row gets room below
        rules.append(".sk-footer-row .wp-block-navigation__container{display:flex;flex-wrap:wrap;justify-content:center;gap:.5rem 1.5rem}"
                     "footer:has(.sk-footer-row){text-align:center}.sk-footer-row{margin-bottom:1rem}")
    if "sk-footer-note" in uses:   # site-kit#424: the footer's small print, in the band's own ink, quieter than the links
        rules.append(".sk-footer-note{margin:.75rem 0 0;font-size:.875rem;opacity:.8}")
    if "sk-footer-family" in uses:   # site-kit#428: the family row, one line that wraps, the current site in bold and not linked
        rules.append(".sk-footer-family{display:flex;flex-wrap:wrap;align-items:baseline;gap:.25rem 1rem;margin:1rem 0 0;font-size:.875rem}"
                     ".sk-footer-family p{margin:0;opacity:.8}.sk-footer-family ul{display:flex;flex-wrap:wrap;gap:.25rem 1rem;"
                     "list-style:none;margin:0;padding:0}.sk-footer-family [aria-current]{font-weight:700}"
                     "footer:has(.sk-footer-row) .sk-footer-family{justify-content:center}")
    link_sels = [f".{c} .wp-block-button__link" for c in ("sk-style-link", "sk-cta_style-link") if c in uses]
    if link_sels:
        rules.append(",".join(link_sels) + "{background:none;color:var(--st-accent);min-height:0;padding:0;border-radius:0;"
                     "font-size:1.25rem;font-weight:700;text-decoration:underline}")
        if "sk-style-link" in uses:   # a cta is an accent band: its link takes the band's own ink, never accent on accent (site-kit#391)
            rules.append(".cta.sk-style-link .wp-block-button__link{color:inherit}")
    if {b for b in bands_used if b in ("light", "dark")}:   # blocks.css drops the top padding of a text/list/menu section that follows another
        rules.append(":is(.text,.list,.menu):is(.sk-band-light,.sk-band-dark){padding-top:2.5rem}")   # one; a band's edge needs its padding back
    for name, band in sorted((brand_rec.get("bands") or {}).items()):
        if name == "card":   # only the strip's ground, used above
            if set(band) != {"ground"} or not (isinstance(band["ground"], str) and brand.HEX.fullmatch(band["ground"])):
                raise layout.LayoutError('bands.card must be {"ground": #rgb or #rrggbb hex}')
            continue
        if name not in brand.BANDS or not all(isinstance(band.get(k), str) and brand.HEX.fullmatch(band[k]) for k in ("ground", "ink")) \
                or not set(band) <= {"ground", "ink", "font"}:
            raise layout.LayoutError(f"bands.{name} must be {{ground, ink}}, each a #rgb or #rrggbb hex, and optionally a font role")
        face = ""
        if "font" in band:
            if not isinstance(band["font"], str) or band["font"] not in (brand_rec.get("fonts") or {}) or not ROLE.fullmatch(band["font"]):
                raise layout.LayoutError(f"bands.{name}.font {band['font']!r} is not a role of the brand's fonts")
            face = f";font-family:var(--sk-font-{band['font']})"
        rules.append(f".sk-band-{name}{{background:{band['ground']};color:{band['ink']}}}"
                     f".sk-band-{name} :is(h1,h2,h3,h4,h5,h6){{color:inherit{face}}}")
    return [f"<style>{''.join(rules)}</style>"] if rules else []


def header_site(brand_rec, header_size=None):
    """The `header` entry of the site data for to_html, or None: the banner image's served path, alt and (if the build could
    read it) its size, so the page holds its place while the image loads."""
    header = brand_rec.get("header") or {}
    if "image" not in header:
        return None
    alt = header.get("image_alt")
    if not (isinstance(alt, str) and alt.strip()) or re.search(r"[\x00-\x1f\x7f\u2028\u2029]", alt):
        raise layout.LayoutError("header.image_alt is required with header.image: one line of text")
    out = {"src": _web(header["image"], brand_rec), "alt": alt}
    if header_size:
        out["width"], out["height"] = header_size
    return out


def analytics_head(brand_rec):
    """The site's analytics tags for every page's head (site-kit#240), from the brand record's optional `analytics`
    object, or nothing without it. Both values are public site identifiers. They are held to the brand check's own shapes
    here too, so a record that skipped `brand.check` still cannot write anything but a token or an id into a page."""
    an = brand_rec.get("analytics")
    if an is None:
        return []
    if not isinstance(an, dict) or set(an) - brand.ANALYTICS:
        raise layout.LayoutError("analytics must hold only cloudflare and ga4")
    tags = []
    if "cloudflare" in an:
        token = an["cloudflare"]
        if not (isinstance(token, str) and brand.CF_TOKEN.fullmatch(token)):
            raise layout.LayoutError("analytics.cloudflare must be a 32-character lowercase hex token")
        tags.append('<script defer src="https://static.cloudflareinsights.com/beacon.min.js" '
                    f"data-cf-beacon='{{\"token\": \"{serialize.escape(token)}\"}}'></script>")
    if "ga4" in an:
        gid = an["ga4"]
        if not (isinstance(gid, str) and brand.GA4_ID.fullmatch(gid)):
            raise layout.LayoutError("analytics.ga4 must be a measurement id like G-ABC123XYZ")
        e = serialize.escape(gid)
        tags.append(f'<script async src="https://www.googletagmanager.com/gtag/js?id={e}"></script>')
        tags.append("<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}"
                    f"gtag('js',new Date());gtag('config','{e}');</script>")
    return tags


def document(record, path, brand_rec, origin, blocks, page_types, css=None, head_extra=(), header_size=None, image=None, family=None):
    """The whole static HTML document for one page of a valid record. `image`, a site path, is its og:image in place of the
    brand's share image (a post's featured image, site-kit#321). A post page declares its type on <body>."""
    if not ORIGIN.fullmatch(origin):
        raise layout.LayoutError("origin must be https://host, with no path")
    if css is not None and not re.fullmatch(r"^/[A-Za-z0-9._/-]+\.css$", css):
        raise layout.LayoutError("css must be a site path ending in .css")
    body = serialize.page(record, path, blocks, page_types, brand_rec)   # validates the record first
    page = next(p for p in record["pages"] if p["path"] == path)
    site = site_data(record, brand_rec)
    if family:   # site-kit#428: the family row in the footer, from the list build.py checked and marked
        site["family"] = family
    banner = header_site(brand_rec, header_size)
    hero_props = [s.get("props", {}) for s in next(p for p in record["pages"] if p["path"] == path)["sections"] if str(s.get("block", "")).startswith("hero@")]
    no_menu = any(p.get("menu") is True for p in hero_props)
    no_logo = any(s.get("props", {}).get("logo") in (True, "large") and s.get("block", "").startswith("hero@") for s in next(p for p in record["pages"] if p["path"] == path)["sections"])
    part = lambda name: serialize.section({"block": f"{name}@1", "props": {}}, blocks)   # noqa: E731  (no id: no anchor)
    e = serialize.escape
    title = page["title"] if path == "/" else f"{page['title']} | {brand_rec['name']}"
    head = [
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        f"<title>{e(title)}</title>",
        f'<link rel="canonical" href="{e(origin + path)}">',
        f'<meta property="og:title" content="{e(title)}">',
        f'<meta property="og:type" content="website">',
        f'<meta property="og:url" content="{e(origin + path)}">',
        f'<meta property="og:image" content="{e(origin + (image or _web(brand_rec["share_image"], brand_rec)))}">',
        '<meta name="twitter:card" content="summary_large_image">',
        f'<link rel="icon" href="{e(_web(brand_rec["icons"]["ico"], brand_rec))}" sizes="any">',
        f'<link rel="icon" type="image/png" sizes="32x32" href="{e(_web(brand_rec["icons"]["32"], brand_rec))}">',
        f'<link rel="apple-touch-icon" href="{e(_web(brand_rec["icons"]["180"], brand_rec))}">',
        f"<style>{tokens(brand_rec)}</style>",
    ]
    if page.get("description"):
        head[3:3] = [f'<meta name="description" content="{e(page["description"])}">',
                     f'<meta property="og:description" content="{e(page["description"])}">']
    if page.get("index") is False:   # site-kit#246, #249: out of search, with no markdown twin (agents.py)
        head.append('<meta name="robots" content="noindex">')
    else:
        twin = path.rstrip("/") + "/index.md"
        head.append(f'<link rel="alternate" type="text/markdown" href="{e(origin + twin)}">')
    if css:
        head.append(f'<link rel="stylesheet" href="{e(css)}">')
    head += look(brand_rec, bands_used={s.get("band") for s in page["sections"]}, uses={c for c in USES if c in body} | ({("sk-footer-row" if record["footer"].get("layout") == "row" else "sk-footer-columns")} if record.get("footer") else set())
                        | ({"sk-footer-note"} if (record.get("footer") or {}).get("note") else set())
                        | ({"sk-footer-family"} if (record.get("footer") or {}).get("family") else set()))
    head += list(head_extra)   # the build's catalog links and JSON-LD blocks, already made safe for a <script>
    head += analytics_head(brand_rec)
    html = lambda markup: serialize.to_html(markup, site, path)   # noqa: E731
    main = html(body)
    header_html = lambda markup: serialize.to_html(   # noqa: E731  (only the header part shows the banner or leaves out the logo: the page's sections and the footer keep theirs)
        markup, dict(site, **({"header": banner} if banner else {}), **({"no_logo": True} if no_logo else {}), **({"no_menu": True} if no_menu else {})), path)
    if "<h1" not in main:   # a page with no hero shows its title, as WordPress's page template does with its post-title block
        main = f'<h1 class="wp-block-post-title">{e(page["title"])}</h1>\n' + main
    return ("<!doctype html>\n<html lang=\"en\">\n<head>\n" + "\n".join(head) + "\n</head>\n" + ('<body data-page-type="post">' if page["type"] == "post" else "<body>") + "\n"
            + ("" if no_logo and no_menu else header_html(part("header"))) + "\n<main>\n" + main + "\n</main>\n" + html(part("footer")) + "\n</body>\n</html>\n")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("record")
    ap.add_argument("brand")
    ap.add_argument("path")
    ap.add_argument("--origin", required=True)
    ap.add_argument("--css")
    ap.add_argument("--root", default=".", help="where the brand record's files are (for its check)")
    args = ap.parse_args(argv)
    try:
        record = json.loads(pathlib.Path(args.record).read_text(encoding="utf-8"))
        brand_rec = brand.check(args.brand, args.root)
        print(document(record, args.path, brand_rec, args.origin, layout.load_blocks(),
                       json.loads(layout.PAGE_TYPES.read_text(encoding="utf-8")), args.css), end="")
        return 0
    except (OSError, ValueError) as err:
        print(f"render: cannot read ({err})", file=sys.stderr)
    except (layout.LayoutError, brand.BrandError) as err:
        print(f"render: {err}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
