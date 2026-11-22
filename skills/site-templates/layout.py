"""Site templates, step 1 (site-kit#119, design on superintelligentfoo#175): blocks and the layout record, and the one
validator that decides whether either is allowed.

A block (blocks/<name>/block.json) is a props schema and a tree built ONLY from parts that map one-to-one to WordPress
core blocks, so one source renders as a static page and exports as block-theme markup. Any other part (core/html
included) fails. A layout record (.sitekit/layout.json) lists each page's sections in order; it is the only thing a
person or an agent edits. The validator checks the WHOLE record, however it was made (ops, a hand edit, a merge or a
starter): block versions, every prop against its schema (required props too, so an empty contact block fails), the
required blocks per page type, unique section ids, a home page and the template's required routes, and every internal
link in a prop pointing at a page that exists. With --publish, a {{placeholder:...}} left anywhere fails as well.

    python3 layout.py --blocks                    every block.json in blocks/ is well formed
    python3 layout.py .sitekit/layout.json [--publish] [--require /contact/ ...]

Standard library only.
"""
import argparse
import copy
import datetime
import functools
import json
import os
import pathlib
import re
import sys
import unicodedata
import urllib.parse

HERE = pathlib.Path(__file__).resolve().parent
BLOCKS = HERE / "blocks"
PAGE_TYPES = HERE / "page-types.json"
STARTERS = HERE / "starters"

# Each part is one WordPress core block. CONTAINS says which parts a part may hold; a part not listed holds none.
STATIC_PARTS = {"group", "columns", "column", "heading", "paragraph", "image", "buttons", "button", "list", "list-item",
                "details", "quote", "gallery"}
DYNAMIC_PARTS = {"site-title", "site-logo", "navigation", "query"}   # render from data: accepted, named differences
PARTS = STATIC_PARTS | DYNAMIC_PARTS
CONTAINS = {"group": PARTS - {"column", "button", "list-item"}, "column": PARTS - {"column", "button", "list-item"},
            "columns": {"column"}, "buttons": {"button"}, "list": {"list-item"},
            "details": {"heading", "paragraph", "list", "image", "buttons"}, "quote": {"paragraph"}, "gallery": {"image"}}
# Every field a part may carry (besides "part", "children" and "each"), and what kind of value it takes:
#   words  literal text and {slots} that are words: a text prop whole, a link's .text, an image's .alt
#   href   exactly one link's {x.href}, or a literal safe address; never a text prop (game-dev-3 on #121: javascript:)
#   src    exactly one image's {x.src}, or a literal site path or https: address
#   alt    an image's {x.alt}, a text prop, or literal text
#   slot   exactly one text prop, used whole ({name}): the name of a plugin slot (site-kit#223), on a group that holds nothing
#   a set or a range: a literal from it, never a slot
FIELDS = {"group": {"tag": {"div", "header", "main", "section", "article", "aside", "footer"}, "slot": "slot"}, "columns": {}, "column": {},
          "heading": {"level": range(1, 7), "text": "words"}, "paragraph": {"text": "words"},
          "image": {"src": "src", "alt": "alt", "caption": "words"}, "buttons": {}, "button": {"text": "words", "href": "href", "newtab": {True}}, "list": {},
          "list-item": {"text": "words"}, "details": {"summary": "words"}, "quote": {"cite": "words"}, "gallery": {},
          "site-title": {}, "site-logo": {}, "navigation": {"label": {"Main", "Footer"}, "where": {"header", "footer"}},
          "query": {"kind": {"posts"}, "count": range(1, 25)}}
PROP_TYPES = {"text", "link", "image", "items", "choice", "flag", "count", "prefill"}   # choice: one of `values`; flag: true or false (site-kit#243)
SLOT = re.compile(r"\{([a-z_][a-z0-9_]*)(?:\.([a-z_][a-z0-9_]*))?(?:\.([a-z_][a-z0-9_]*))?\}")
SUBPARTS = {"link": {"text", "href"}, "image": {"src", "alt"}, "prefill": {"text", "claude", "chatgpt"}}
PLACEHOLDER = re.compile(r"\{\{placeholder:[^}]*\}\}")
NAME = re.compile(r"^[a-z][a-z0-9-]{0,39}$")
SLOT_NAME = re.compile(r"^[a-z0-9-]{1,40}$")   # a plugin slot's name (site-kit#223): it goes into a class, so nothing else
PATH = re.compile(r"^/(?:[a-z0-9][a-z0-9-]*/)*$")
PAGE_HREF = re.compile(r"^/(?:[a-z0-9][a-z0-9-]*/)*(?:#[A-Za-z0-9_-]+)?$")   # a page path, maybe with an #anchor
#: members' sign-in route (site-kit#601): a menu may link it, and for a signed-in visitor the gate's edge swaps it for their menu
SIGN_IN = "/_doorman/sign-in"
# site-kit#563: the record's optional auth_host, the host that signs people in: an https origin, lowercase, nothing after the host
AUTH_HOST = re.compile(r"https://[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+")
# An address that goes somewhere: https:// plus a host, mailto: plus an address, tel: plus digits, # plus a name. No
# address needs a < > " ` or backslash, so none is allowed (site-kit#134): each one only ever ends an attribute, a markdown
# link or a tag early. Nor a control byte (mi-dev-2 on site-kit#529): \x00-\x1f and \x7f would be written raw into the href.
URL_CHAR = r'[^\s<>"`\\\x00-\x1f\x7f]'
SAFE_HREF = re.compile(rf"^(?:https://[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?:[/?#]{URL_CHAR}*)?"
                       rf"|mailto:[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{{2,}}|tel:\+?[0-9][0-9 ().-]{{5,}}[0-9]|#[A-Za-z0-9_-]+)$")
# An image: a site path or an https address, never with a ".." segment (site-kit#134).
SAFE_SRC = re.compile(rf"^(?!.*/\.\.(?:/|$))(?:/(?!/)[A-Za-z0-9._~-][A-Za-z0-9._~/-]*|https://[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/{URL_CHAR}*)$")
MAX_TEXT = 2000
# site-kit#526: a text prop whose block opts in with "links": true may carry [words](href) links, and no other markup.
# A link's href is held to a link prop's rule. Anything left with a "](" after the links are taken out is refused, so
# an empty [] or (), a nested [ or an address with a space never builds as half a link.
INLINE_LINK = re.compile(r"\[([^\[\]\n]+)\]\(([^()\s]+)\)")


def inline_parts(text):
    """[(words, href or None)]: a links-on text cut into plain runs and its links, in order."""
    out, at = [], 0
    for m in INLINE_LINK.finditer(text):
        if m.start() > at:
            out.append((text[at:m.start()], None))
        out.append((m.group(1), m.group(2)))
        at = m.end()
    if at < len(text):
        out.append((text[at:], None))
    return out


def inline_problems(text, where):
    """What is wrong with the links in a links-on text."""
    out = [f"{where}: a link [{w}]({h}) must go to a page path, https:, mailto:, tel: or #anchor"
           for w, h in inline_parts(text) if h is not None and not (PAGE_HREF.fullmatch(h) or SAFE_HREF.fullmatch(h))]
    if "](" in INLINE_LINK.sub("", text):
        out.append(f"{where}: a link is written [words](address), with no space in the address and no [ inside the words")
    return out
# site-kit#435: a prefill prop is a request typed into Claude or ChatGPT when the visitor opens it. The build makes both
# links, the request URL-encoded after ?q=, and refuses one whose link would pass PREFILL_LIMIT characters (a longer
# address can break), so a page never carries a link that opens an empty or cut-off chat. Only these two hosts.
PREFILL_LIMIT = 2000
PREFILL_HOSTS = {"claude": "https://claude.ai/new?q=", "chatgpt": "https://chatgpt.com/?q="}


def prefill_links(prompt):
    """{"text", "claude", "chatgpt"} for one request: the words, and each assistant's link with them typed in."""
    q = urllib.parse.quote(prompt, safe="")
    return {"text": prompt, **{k: base + q for k, base in PREFILL_HOSTS.items()}}
TITLE_MAX = {"post": 120}   # a page's title is at most 70 characters; a blog post's headline, blog-writer's own limit (site-kit#321)
MAX_ITEMS = 50   # an item list's ceiling when its block names none (game-dev-2 on #142: 500 items passed)
LINE_BREAK = re.compile(r"[\x00-\x1f\x7f\u2028\u2029]")   # one-line fields: no line break or control character
# A lone surrogate (a "\ud800" escape in JSON with no partner) is half a character: it can't be written as UTF-8, so a
# record holding one would pass here and fail at the build's write instead (site-kit#150, maint-review-2 on site-agent#131).
SURROGATE = re.compile("[\ud800-\udfff]")


class LayoutError(Exception):
    """A block or a layout record is not allowed; the message names each problem."""


# The same rule as brand.EMAIL (a test holds them equal): no ":" or "/", so never "javascript:x//@a.co".
EMAIL = re.compile(r"^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
# site-kit#301 (trenzbarbershop#33): a local business's place, phone and hours, for one LocalBusiness block on home.
# Only real values: hours appear only when given, and nothing here is ever guessed.
BUSINESS_TYPES = {"LocalBusiness", "BarberShop", "BeautySalon", "HairSalon", "NailSalon", "DaySpa", "HealthClub",
                  "HomeAndConstructionBusiness", "GeneralContractor", "HVACBusiness", "Electrician", "Plumber", "Locksmith",
                  "RoofingContractor", "HousePainter", "MovingCompany", "AutoRepair", "Dentist", "MedicalBusiness",
                  "ProfessionalService", "LegalService", "AccountingService", "Store", "Restaurant", "CafeOrCoffeeShop",
                  "Bakery", "ChildCare", "SportsActivityLocation", "EntertainmentBusiness", "LodgingBusiness"}
BUSINESS_TEXT = ("streetAddress", "addressLocality", "addressRegion", "postalCode")
PHONE = re.compile(r"^\+?[0-9(][0-9 ()-]{5,22}$")
HOURS = re.compile(r"^(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)* "
                   r"(?:[01][0-9]|2[0-3]):[0-5][0-9]-(?:[01][0-9]|2[0-4]):[0-5][0-9]$")


def business_problems(b, publish=False):
    """What is wrong with a record's "business": {"@type", "addressLocality", "addressRegion"} and, if known, the street
    address, postal code, country, telephone, the towns it serves, its own pages elsewhere and its hours."""
    keys = {"@type", "addressCountry", "telephone", "areaServed", "sameAs", "openingHours", *BUSINESS_TEXT}
    if not isinstance(b, dict) or set(b) - keys or not {"@type", "addressLocality", "addressRegion"} <= set(b):
        return ['business is {"@type", "addressLocality", "addressRegion"} and may have "streetAddress", "postalCode", '
                '"addressCountry", "telephone", "areaServed", "sameAs" and "openingHours"']
    out = []
    if b["@type"] not in BUSINESS_TYPES:
        out.append(f"business: @type must be one of {', '.join(sorted(BUSINESS_TYPES))}")
    for k in BUSINESS_TEXT:
        if k in b and (not isinstance(b[k], str) or blank(b[k]) or len(b[k]) > 100 or LINE_BREAK.search(b[k])):
            out.append(f"business: {k} must be one line of words, at most 100 characters")
        elif k in b and publish and PLACEHOLDER.search(b[k]):
            out.append(f"business: {k} still holds a {{{{placeholder:...}}}}")
    if "addressCountry" in b and not (isinstance(b["addressCountry"], str) and re.fullmatch(r"[A-Z]{2}", b["addressCountry"])):
        out.append("business: addressCountry is a two-letter code, like US")
    if "telephone" in b and not (isinstance(b["telephone"], str) and PHONE.fullmatch(b["telephone"])):
        out.append("business: telephone is digits, spaces, + ( ) and - only")
    for k, ok, say in (("areaServed", lambda v: not blank(v) and len(v) <= 60 and not LINE_BREAK.search(v), "town names, at most 60 characters each"),
                       ("sameAs", lambda v: v.startswith("https://") and bool(SAFE_HREF.fullmatch(v)), "https:// addresses"),
                       ("openingHours", lambda v: bool(HOURS.fullmatch(v)), 'hours like "Mo-Fr 09:00-18:00"')):
        if k in b and not (isinstance(b[k], list) and 0 < len(b[k]) <= 12 and all(isinstance(v, str) and ok(v) for v in b[k])):
            out.append(f"business: {k} is a list of 1 to 12 {say}")
    return out


def blank(text):
    """True when `text` shows nothing: only spaces and invisible characters (zero-width, format) left."""
    return not "".join(ch for ch in text if unicodedata.category(ch) not in {"Cf", "Zs", "Zl", "Zp", "Cc"}).strip()


# ---- blocks ----

def _check_props(props, where):
    out = []
    if not isinstance(props, dict):
        return [f"{where}: props must be an object"]
    for name, spec in props.items():
        w = f"{where}.props.{name}"
        if not re.fullmatch(r"^[a-z_][a-z0-9_]*$", name) or name == "item":
            out.append(f"{w}: not a prop name")
        if not isinstance(spec, dict) or spec.get("type") not in PROP_TYPES:
            out.append(f"{w}: type must be one of {', '.join(sorted(PROP_TYPES))}")
            continue
        out += [f"{w}: unknown key {k!r}" for k in sorted(set(spec) - {"type", "required", "max", "fields", "needs", "values", "also", "min", "links"})]
        if not isinstance(spec.get("required", False), bool):
            out.append(f"{w}: required must be true or false")
        if "links" in spec and not (spec["type"] == "text" and spec["links"] is True):
            out.append(f"{w}: only a text takes links, and only as true")
        if spec["type"] in ("text", "items", "prefill") and not (isinstance(spec.get("max", 1), int) and not isinstance(spec.get("max"), bool)
                                                     and spec.get("max", 1) >= 1):
            out.append(f"{w}: max must be a whole number of at least 1")
        if spec["type"] == "count" and not (all(isinstance(spec.get(k), int) and not isinstance(spec.get(k), bool) for k in ("min", "max"))
                                            and spec["min"] <= spec["max"]):
            out.append(f"{w}: a count has a whole min and max, min not above max")
        elif spec["type"] == "items" and "min" in spec and not (isinstance(spec["min"], int) and not isinstance(spec["min"], bool)
                                                                 and 1 <= spec["min"] <= spec.get("max", MAX_ITEMS)):
            out.append(f"{w}: an items min is a whole number from 1 to its max")
        elif spec["type"] not in ("count", "items") and "min" in spec:
            out.append(f"{w}: only a count or items takes min")
        if spec["type"] == "choice":
            vals = spec.get("values")
            if not (isinstance(vals, list) and vals and all(isinstance(v, str) and re.fullmatch(r"[a-z][a-z0-9-]{0,19}", v) for v in vals)):
                out.append(f"{w}: a choice lists its values (short lowercase words)")
        elif "values" in spec:
            out.append(f"{w}: only a choice takes values")
        if "also" in spec and not (spec["type"] == "flag" and isinstance(spec["also"], list) and spec["also"]
                                   and all(isinstance(v, str) and re.fullmatch(r"[a-z][a-z0-9-]{0,19}", v) for v in spec["also"])):
            out.append(f"{w}: only a flag takes also, a list of short lowercase words")
        if spec["type"] == "items":
            fields = spec.get("fields")
            if not isinstance(fields, dict) or not fields:
                out.append(f"{w}: items need fields")
            else:
                for f, s in fields.items():   # each field held to the same rules as a prop (game-dev-3 on site-kit#137)
                    fw = f"{w}.fields.{f}"
                    if not isinstance(s, dict) or s.get("type") not in {"text", "link", "image", "choice", "count"}:
                        out.append(f"{fw}: an item field is text, link, image, choice or count")
                        continue
                    out += [f"{fw}: unknown key {k!r}" for k in sorted(set(s) - {"type", "required", "max", "values", "min", "links"})]
                    if not isinstance(s.get("required", False), bool):
                        out.append(f"{fw}: required must be true or false")
                    if "links" in s and not (s["type"] == "text" and s["links"] is True):
                        out.append(f"{fw}: only a text takes links, and only as true")
                    if s["type"] == "choice" and not (isinstance(s.get("values"), list) and s["values"] and all(
                            isinstance(v, str) and re.fullmatch(r"[a-z][a-z0-9-]{0,19}", v) for v in s["values"])):
                        out.append(f"{fw}: a choice lists its values (short lowercase words)")
                    elif s["type"] != "choice" and "values" in s:   # as the prop check refuses (mi-dev-1 on site-kit#251)
                        out.append(f"{fw}: only a choice takes values")
                    if s["type"] == "count" and not (all(isinstance(s.get(k), int) and not isinstance(s.get(k), bool) for k in ("min", "max"))
                                                     and s["min"] <= s["max"]):
                        out.append(f"{fw}: a count has a whole min and max, min not above max")
                    elif s["type"] != "count" and "min" in s:
                        out.append(f"{fw}: only a count takes min")
                    if s["type"] == "text" and not (isinstance(s.get("max", 1), int) and not isinstance(s.get("max"), bool)
                                                    and s.get("max", 1) >= 1):
                        out.append(f"{fw}: max must be a whole number of at least 1")   # the same rule as a prop's
            needs = spec.get("needs", [])
            if not (isinstance(needs, list) and all(n in {"tel:", "mailto:", "https://"} for n in needs)):
                out.append(f"{w}: needs lists schemes from tel:, mailto: and https://")
        elif "needs" in spec or "fields" in spec:
            out.append(f"{w}: only items take fields or needs")
    return out


def _slot_spec(m, props, item):
    """(spec, part used) for one slot, or a problem string."""
    name, sub, subsub = m.groups()
    if item and name == "item":
        spec, rest = props[item]["fields"].get(sub), subsub
        if spec is None:
            return f"{m.group(0)} is not a field of {item}"
    elif name in props and props[name]["type"] != "items" and subsub is None:
        spec, rest = props[name], sub
    else:
        return f"{m.group(0)} is not a prop of this block"
    want = SUBPARTS.get(spec["type"])   # a link or an image is used by its parts ({cta.href}); text is used whole
    if (want and rest not in want) or (not want and rest is not None):
        return f"{m.group(0)} must be " + (f"one of .{', .'.join(sorted(want))}" if want else "used whole")
    return spec["type"], rest


def _check_field(part, k, value, props, item):
    """Problems with one field's value, by the kind of value the field takes."""
    kind = FIELDS[part][k]
    if not isinstance(kind, str):   # a set or a range of literals
        ok = value in kind and (not isinstance(kind, range) or (isinstance(value, int) and not isinstance(value, bool)))
        return [] if ok else [f"{k} must be one of {sorted(kind) if isinstance(kind, set) else f'{kind.start} to {kind.stop - 1}'}"]
    if not isinstance(value, str):
        return [f"{k} must be text"]
    out, used = [], []
    for m in SLOT.finditer(value):
        got = _slot_spec(m, props, item)
        if isinstance(got, str):
            out.append(got)
        else:
            used.append((m.group(0), got))
    rest = SLOT.sub("", PLACEHOLDER.sub("", value))
    if "{" in rest or "}" in rest:
        out.append(f"{value!r} has a brace that is not a slot (a slot is {{name}}, {{name.part}} or {{item.field}})")
    if kind == "slot":
        if len(used) != 1 or used[0][0] != value or used[0][1] != ("text", None):
            out.append(f"{k} takes exactly one text prop, used whole ({{name}})")
    elif kind in {"href", "src"}:
        want = {("link", "href"), ("prefill", "claude"), ("prefill", "chatgpt")} if kind == "href" else {("image", "src")}
        if used:
            if len(used) != 1 or used[0][0] != value or used[0][1] not in want:
                out.append(f"{k} takes exactly one " + ("{x.href} from a link, or {x.claude} or {x.chatgpt} from a prefill"
                                                        if kind == "href" else "{x.src} from an image") + ", never other text")
        elif value and not (SAFE_HREF if kind == "href" else SAFE_SRC).fullmatch(value) and not PAGE_HREF.fullmatch(value):
            out.append(f"{k}: {value!r} is not a safe address")
    else:
        allowed = {("text", None), ("link", "text"), ("image", "alt"), ("prefill", "text")}
        out += [f"{slot} is an address, not words" for slot, got in used if got not in allowed]
    return out


def _check_tree(node, props, where, item=None):
    """Problems in one tree node and its children. `item` is the items prop an "each" node repeats over."""
    if not isinstance(node, dict) or node.get("part") not in PARTS:
        part = node.get("part") if isinstance(node, dict) else node
        return [f"{where}: {part!r} is not an allowed part (only {', '.join(sorted(PARTS))}: each maps to one core block)"]
    part, out = node["part"], []
    extra = set(node) - {"part", "children", "each"} - set(FIELDS[part])
    out += [f"{where}: {part} has no field {k!r}" for k in sorted(extra)]
    each = node.get("each")
    if each is not None:
        if item is not None or props.get(each, {}).get("type") != "items":
            out.append(f"{where}: each must name an items prop, not nested")
        else:
            item = each
    for k in sorted(set(FIELDS[part]) & set(node)):
        out += [f"{where}.{k}: {p}" for p in _check_field(part, k, node[k], props, item)]
    kids = node.get("children", [])
    if "slot" in node and kids:
        out.append(f"{where}: a slot group holds nothing (a plugin fills it)")
    if not isinstance(kids, list):
        out.append(f"{where}: children must be a list")
    elif kids and part not in CONTAINS:
        out.append(f"{where}: {part} holds no parts")
    else:
        for i, kid in enumerate(kids):
            if isinstance(kid, dict) and kid.get("part") in PARTS and kid["part"] not in CONTAINS[part]:
                out.append(f"{where}.children[{i}]: a {part} cannot hold a {kid['part']}")
            out += _check_tree(kid, props, f"{where}.children[{i}]", item)
    return out


def block_problems(spec, name):
    """Every problem with one block.json, already parsed."""
    where = f"block {name}"
    if not isinstance(spec, dict):
        return [f"{where}: not a JSON object"]
    out = [f"{where}: unknown key {k!r}" for k in sorted(set(spec) - {"name", "version", "title", "props", "tree"})]
    if spec.get("name") != name:
        out.append(f"{where}: name must be the folder name")
    if not (isinstance(spec.get("version"), str) and re.fullmatch(r"^[1-9][0-9]*\.[0-9]+$", spec["version"])):
        out.append(f"{where}: version must be major.minor")
    if not (isinstance(spec.get("title"), str) and spec["title"].strip()):
        out.append(f"{where}: title is required")
    out += _check_props(spec.get("props"), where)
    if not out:
        # The root is a group, so a section always has an element to carry its id as its anchor (game-dev-3 on #124).
        if not (isinstance(spec.get("tree"), dict) and spec["tree"].get("part") == "group" and "each" not in spec["tree"]):
            out.append(f"{where}.tree: the root must be one group, so the section's anchor has an element")
        out += _check_tree(spec.get("tree"), spec["props"], f"{where}.tree")
    return out


def load_blocks(folder=BLOCKS):
    """{name: spec} for every block in `folder`, or LayoutError naming every problem."""
    blocks, out = {}, []
    for d in sorted(p for p in pathlib.Path(folder).iterdir() if p.is_dir()):
        if not NAME.fullmatch(d.name):
            out.append(f"block {d.name}: not a block name")
            continue
        try:
            spec = json.loads((d / "block.json").read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            out.append(f"block {d.name}: cannot read block.json ({e})")
            continue
        found = block_problems(spec, d.name)
        out += found
        if not found:
            blocks[d.name] = spec
    if out:
        raise LayoutError("\n  ".join(out))
    return blocks


# ---- the layout record ----

def _shows(value, spec):
    """Whether a field's value would render anything: non-blank text, a link with words and an address, an image with a src."""
    words = lambda v: isinstance(v, str) and not blank(v)   # noqa: E731
    t = spec["type"]
    if t in ("text", "prefill"):
        return words(value)
    if t == "link":
        return isinstance(value, dict) and words(value.get("text")) and words(value.get("href"))
    if t == "image":
        return isinstance(value, dict) and words(value.get("src"))
    return isinstance(value, list) and bool(value)


def _value_problems(value, spec, where, publish):
    t, out = spec["type"], []
    if t == "text":
        if not isinstance(value, str):
            return [f"{where}: must be text"]
        if len(value) > spec.get("max", MAX_TEXT):
            out.append(f"{where}: longer than {spec.get('max', MAX_TEXT)} characters")
        if spec.get("required") and blank(value):
            out.append(f"{where}: is required and empty")
        if spec.get("links"):
            out += inline_problems(value, where)
    elif t == "prefill":
        if not isinstance(value, str):
            return [f"{where}: must be text (the request typed into Claude or ChatGPT)"]
        if len(value) > spec.get("max", MAX_TEXT):
            out.append(f"{where}: longer than {spec.get('max', MAX_TEXT)} characters")
        if spec.get("required") and blank(value):
            out.append(f"{where}: is required and empty")
        n = max(len(u) for k, u in prefill_links(value).items() if k != "text")
        if n > PREFILL_LIMIT:
            out.append(f"{where}: its link would be {n} characters, over {PREFILL_LIMIT}; shorten the request")
    elif t == "link":
        if not isinstance(value, dict) or set(value) != {"text", "href"} or not all(isinstance(v, str) for v in value.values()):
            return [f'{where}: a link is {{"text": ..., "href": ...}}']
        # A starter's address may be a {{placeholder:...}} until publish (the build shows it as a button with no link).
        if not (PAGE_HREF.fullmatch(value["href"]) or SAFE_HREF.fullmatch(value["href"]) or PLACEHOLDER.fullmatch(value["href"])):
            out.append(f"{where}: href must be a page path, https:, mailto:, tel: or #anchor")
        if spec.get("required") and (blank(value["text"]) or blank(value["href"])):
            out.append(f"{where}: is required and empty")
    elif t == "image":
        if not isinstance(value, dict) or set(value) != {"src", "alt"} or not all(isinstance(v, str) for v in value.values()):
            return [f'{where}: an image is {{"src": ..., "alt": ...}}']
        if value["src"] and not SAFE_SRC.fullmatch(value["src"]):
            out.append(f"{where}: src must be a site path or an https: address")
        if spec.get("required") and blank(value["src"]):
            out.append(f"{where}: is required and empty")
        if value["src"] and blank(value["alt"]):
            out.append(f"{where}: an image needs alt text")
    elif t == "choice":
        if not (isinstance(value, str) and value in spec["values"]):
            out.append(f"{where}: must be one of {', '.join(spec['values'])}")
    elif t == "count":
        if not (isinstance(value, int) and not isinstance(value, bool) and spec["min"] <= value <= spec["max"]):
            out.append(f"{where}: must be a whole number from {spec['min']} to {spec['max']}")
    elif t == "flag":
        if not (isinstance(value, bool) or (isinstance(value, str) and value in spec.get("also", ()))):
            out.append(f"{where}: must be true or false" + (f" or {', '.join(spec['also'])}" if spec.get("also") else ""))
    elif t == "items":
        if not isinstance(value, list):
            return [f"{where}: must be a list"]
        if spec.get("required") and not value:
            out.append(f"{where}: is required and empty")
        if len(value) > spec.get("max", MAX_ITEMS):
            out.append(f"{where}: more than {spec.get('max', MAX_ITEMS)} items")
        if value and len(value) < spec.get("min", 1):   # an optional list may be left out, never cut short (hero 1.6's strip)
            out.append(f"{where}: fewer than {spec['min']} items")
        for i, it in enumerate(value):
            if not isinstance(it, dict):
                out.append(f"{where}[{i}]: must be an object")
                continue
            out += [f"{where}[{i}]: unknown field {k!r}" for k in sorted(set(it) - set(spec["fields"]))]
            for f, fs in spec["fields"].items():
                if f in it:
                    out += _value_problems(it[f], fs, f"{where}[{i}].{f}", publish)
                elif fs.get("required"):
                    out.append(f"{where}[{i}].{f}: is required")
            # An item whose fields are all optional (text@1's body, site-kit#223) must still show something: one with
            # nothing in it would render as nothing, so it is refused here rather than left out silently.
            if not any(fs.get("required") for fs in spec["fields"].values()) and not any(
                    _shows(it.get(f), fs) for f, fs in spec["fields"].items()):
                out.append(f"{where}[{i}]: has nothing in it (give it at least one of {', '.join(f for f, fs in spec['fields'].items() if fs['type'] != 'choice')})")
        needs = spec.get("needs")
        if needs and value:
            hrefs = [it[f]["href"] for it in value if isinstance(it, dict) for f, fs in spec["fields"].items()
                     if fs["type"] == "link" and isinstance(it.get(f), dict) and isinstance(it[f].get("href"), str)]
            waiting = not publish and any(PLACEHOLDER.fullmatch(h) for h in hrefs)   # a starter's phone, still to fill
            if not waiting and not any(h.startswith(n) and SAFE_HREF.fullmatch(h) for h in hrefs for n in needs):
                out.append(f"{where}: needs at least one {' or '.join(needs)} address")
    if publish and PLACEHOLDER.search(json.dumps(value)):
        out.append(f"{where}: still holds a {{{{placeholder:...}}}}")
    return out


def _links(value, spec):
    """Every internal page path a prop value links to."""
    if spec["type"] == "link" and isinstance(value, dict) and PAGE_HREF.fullmatch(str(value.get("href", ""))):
        yield value["href"]
    if spec["type"] == "text" and spec.get("links") and isinstance(value, str):
        yield from (h for _, h in inline_parts(value) if h is not None and PAGE_HREF.fullmatch(h))
    if spec["type"] == "items" and isinstance(value, list):
        for it in value:
            for f, fs in spec["fields"].items():
                if isinstance(it, dict) and f in it:
                    yield from _links(it[f], fs)


def _has_surrogate(value):
    # An explicit stack, not recursion: a record nested 600 deep would otherwise raise RecursionError here, where the
    # rest of the check refuses it in words (game-review on #152).
    stack = [value]
    while stack:
        v = stack.pop()
        if isinstance(v, str):
            if SURROGATE.search(v):
                return True
        elif isinstance(v, dict):
            stack.extend(v.keys())
            stack.extend(v.values())
        elif isinstance(v, list):
            stack.extend(v)
    return False


# robots.txt's Content-Signal (herdos#3872, contentsignals.org) and its defaults: search and AI answers yes, training no. A
# client's content is never offered for training without their say; Seth's own sites set "ai-train": "yes" in the record.
SIGNALS = {"search": "yes", "ai-input": "yes", "ai-train": "no"}


def problems(record, blocks, page_types, publish=False, require=(), brand=None):
    """Every problem with a whole layout record. With the brand record, a section's `band` is also held to what the brand defines."""
    if _has_surrogate(record):  # first, and alone: every other message may quote the text, and none of it can be written
        return ["the record has a broken character (a lone surrogate, U+D800 to U+DFFF) that can't be saved: retype the text that holds it"]
    if not isinstance(record, dict) or set(record) - {"template", "why", "pages", "slots", "menu", "footer", "business", "email", "security", "auth_md", "security_schemes", "content_signal", "skills", "auth_host"} or not isinstance(record.get("pages"), list):
        return ['the record is {"template": name, "why": text, "pages": [...]} and may have "slots"']
    out, ids, paths, links = [], set(), [], []
    # game-dev-3 on #125: a record must name a starter that exists, and that starter's routes always apply, so neither
    # dropping "template" nor an op list can remove /contact/.
    tname = record.get("template")
    if not (isinstance(tname, str) and NAME.fullmatch(tname) and (STARTERS / tname / "template.json").is_file()):
        out.append(f"template must name a starter in {STARTERS.name}/ (got {tname!r})")
    require = [*require, *template_require(record)]
    # The site's why, written once (public-site rule 8): llms.txt's summary, the cards and the Organization reuse it.
    why = record.get("why")
    if not isinstance(why, str) or blank(why) or len(why) > 300:
        out.append("why must be words, at most 300 characters: who the site helps and why")
    elif LINE_BREAK.search(why):   # game-dev-2 on #126: a line break ends llms.txt's > summary
        out.append("why must be one line: no line breaks or control characters")
    elif publish and PLACEHOLDER.search(why):
        out.append("why still holds a {{placeholder:...}}")
    elif publish and len(why) < 120:
        out.append("why is under 120 characters: say who you help and why, not a list of features")
    # The robots.txt Content-Signal (herdos#3872): any of search, ai-input, ai-train, each yes or no; the rest keep the default.
    if "content_signal" in record:
        cs = record["content_signal"]
        if not isinstance(cs, dict) or not cs or set(cs) - set(SIGNALS) or any(v not in ("yes", "no") for v in cs.values()):
            out.append("content_signal is {\"search\", \"ai-input\", \"ai-train\"}, each \"yes\" or \"no\" (any left out keeps its default)")
    for pi, page in enumerate(record["pages"]):
        where = f"pages[{pi}]"
        if not isinstance(page, dict) or not {"path", "type", "title", "sections"} <= set(page) \
                or set(page) - {"path", "type", "title", "description", "menu", "index", "gallery", "sections"} or not isinstance(page.get("sections"), list):
            out.append(f'{where}: a page is {{"path", "type", "title", "sections": [...]}} and may have a "description", "menu", "index" and "gallery"')
            continue
        if page.get("menu", "both") not in {"both", "footer", "none"}:   # none: in no menu, still in the sitemap (site-kit#223)
            out.append(f"page {page['path']}: menu is both (the default), footer or none")
        # index: false keeps a page out of search (site-kit#246): a thank-you or cancelled page, reached only by its link.
        if "index" in page and (page["index"] is not False or page["path"] == "/"):
            out.append(f"page {page['path']}: index is false, or left out; the home page is always indexed")
        # gallery: true marks a page of a design gallery (site-kit#387): the gallery at /designs/ and each candidate under it.
        # promote-page drops exactly these, so each is kept out of search and menus.
        if "gallery" in page and (page["gallery"] is not True or not str(page["path"]).startswith("/designs/")
                                  or page.get("index") is not False or page.get("menu") != "none"):
            out.append(f'page {page["path"]}: gallery is true, or left out, and a gallery page is under /designs/ with index false and menu none')
        path, ptype = page["path"], page["type"]
        where = f"page {path}"
        most = TITLE_MAX.get(ptype, 70) if isinstance(ptype, str) else 70
        if not isinstance(page["title"], str) or blank(page["title"]) or len(page["title"]) > most:
            out.append(f"{where}: title must be words, at most {most} characters")
        elif LINE_BREAK.search(page["title"]):   # game-review on #126: it would write structure into llms.txt and the twins
            out.append(f"{where}: title must be one line")
        elif publish and PLACEHOLDER.search(page["title"]):
            out.append(f"{where}: title still holds a {{{{placeholder:...}}}}")
        if "description" in page:
            d = page["description"]
            if not isinstance(d, str) or len(d) > 170:
                out.append(f"{where}: description must be text, at most 170 characters")
            elif LINE_BREAK.search(d):
                out.append(f"{where}: description must be one line")
            elif publish and PLACEHOLDER.search(d):
                out.append(f"{where}: description still holds a {{{{placeholder:...}}}}")
        if not (isinstance(path, str) and PATH.fullmatch(path)):
            out.append(f"{where}: path must look like / or /about/")
        if path in paths:
            out.append(f"{where}: listed twice")
        paths.append(path)
        if ptype not in page_types:
            out.append(f"{where}: unknown page type {ptype!r}")
        present, slots = set(), set()
        for si, sec in enumerate(page["sections"]):
            w = f"{where} section {si}"
            if not isinstance(sec, dict) or not {"id", "block", "props"} <= set(sec) <= {"id", "block", "props", "band", "from", "until"} \
                    or not isinstance(sec.get("props"), dict):
                out.append(f'{w}: a section is {{"id", "block", "props"}} and may have a "band", a "from" and an "until"')
                continue
            out += _gate_problems(sec, w)
            if "band" in sec:
                out += _band_problems(sec["band"], w, brand)
            if not (isinstance(sec["id"], str) and re.fullmatch(r"^[a-z0-9][a-z0-9-]{0,39}$", sec["id"])):
                out.append(f"{w}: id must be short lowercase letters, digits and hyphens")
            elif sec["id"] in ids:
                out.append(f"{w}: id {sec['id']!r} is used twice")
            ids.add(sec["id"])
            name, _, major = str(sec["block"]).partition("@")
            spec = blocks.get(name)
            if spec is None:
                out.append(f"{w}: no block {name!r}")
                continue
            if major != spec["version"].split(".")[0]:
                out.append(f"{w}: {sec['block']!r} does not match {name}@{spec['version'].split('.')[0]} (a major change needs its migration)")
                continue
            present.add(name)
            w = f"{where} {sec['id']} ({name})"
            out += [f"{w}: no prop {k!r}" for k in sorted(set(sec["props"]) - set(spec["props"]))]
            for p, ps in spec["props"].items():
                if p in sec["props"]:
                    out += _value_problems(sec["props"][p], ps, f"{w}.{p}", publish)
                    links += [(w, href) for href in _links(sec["props"][p], ps)]
                elif ps.get("required"):
                    out.append(f"{w}.{p}: is required")
            slot = slot_name(spec, sec["props"])
            if slot is not None:
                if not (isinstance(slot, str) and SLOT_NAME.fullmatch(slot)):
                    out.append(f"{w}: a slot's name is 1 to 40 lowercase letters, digits and hyphens")
                elif slot in slots:
                    out.append(f"{w}: slot {slot!r} is on this page twice")
                slots.add(slot)
        for need in page_types.get(ptype, {}).get("required", []):
            if need not in present:
                out.append(f"{where}: a {ptype} page needs a {need} block")
    out += _slot_map_problems(record, blocks)
    if "/" not in paths:
        out.append("the site has no home page (/)")
    out += [f"the site has no {r} page" for r in require if r not in paths]
    if "skills" in record:
        # herdos#3873 (agent-skills): a site's own skills, checked by the one discovery writer that publishes them.
        import discovery   # here, not at the top: layout.py is loaded by path before its folder is on sys.path
        out += [f"skills: {m}" for m in discovery.problems({"origin": "https://example.com", "name": "site", "description": "site",
                                                             "skills": record["skills"]})]
    if "auth_host" in record and not (isinstance(record["auth_host"], str) and AUTH_HOST.fullmatch(record["auth_host"])):
        out.append('auth_host must be the sign-in host\'s https origin, e.g. "https://auth.example.com": lowercase, no path or port')
    if "menu" in record:
        out += _menu_problems(record["menu"], links, brand, publish)
    if "footer" in record:
        out += _footer_problems(record["footer"], links)
    if "business" in record:
        out += business_problems(record["business"], publish)
    # The lead on site-kit#301: a site's public email comes only from its own record, never the brand's support address.
    if "email" in record and not (isinstance(record["email"], str) and EMAIL.fullmatch(record["email"])):
        out.append("email must be one address, like hello@example.com")
    # doorman#192: /auth.md, how an agent signs in here, held to discovery.py's rules. herdos's agent-auth check fails a site
    # that publishes auth docs with no sign-up on its agent card, so auth_md comes with the card's security_schemes.
    if "security_schemes" in record:
        out += [p.replace("a2a.security_schemes", "security_schemes in .sitekit/layout.json", 1)
                for p in _sibling("discovery").scheme_problems(record["security_schemes"])]
    if "auth_md" in record:
        disc = _sibling("discovery")
        if not disc.auth_md_ok(record["auth_md"]):
            out.append(disc.AUTH_MD_RULE)
        elif PLACEHOLDER.sub("", record["auth_md"]).count("{{"):
            out.append("auth_md holds a {{...}} that is not a {{placeholder:...}}")
        elif publish and "{{" in record["auth_md"]:
            out.append("auth_md still holds a {{placeholder:...}}")
        if "security_schemes" not in record:
            out.append("auth_md needs security_schemes in .sitekit/layout.json: the agent card must declare the sign-up "
                       "/auth.md describes (herdos's agent-auth check)")
    if "security" in record:   # site-kit#528: security.txt's own contact and policy, each optional
        sec = record["security"]
        # A contact may be elsewhere (a mail provider, a form host); the policy is one of the site's own pages, written on
        # its own origin, so a record can't point security.txt's Policy at another host (maint-review and mi-dev-3 on #553).
        contact_ok = lambda v: isinstance(v, str) and v.startswith(("mailto:", "https://")) and bool(SAFE_HREF.fullmatch(v))   # noqa: E731
        if not (isinstance(sec, dict) and sec and not set(sec) - {"contact", "policy"}
                and ("contact" not in sec or contact_ok(sec["contact"]))
                and ("policy" not in sec or (isinstance(sec["policy"], str) and bool(PATH.fullmatch(sec["policy"]))))):
            out.append('security is {"contact": a mailto: or https: address, "policy": a page path of this site}, at least one')
        elif PATH.fullmatch(sec.get("policy", "")):
            links.append(("security.policy", sec["policy"]))
    anchors = {p["path"]: {s.get("id") for s in p["sections"] if isinstance(s, dict)}
               for p in record["pages"] if isinstance(p, dict) and isinstance(p.get("sections"), list)}
    for w, href in links:
        target, _, anchor = href.partition("#")
        if target not in paths:
            out.append(f"{w}: links to {href}, which is not a page")
        elif anchor and anchor not in anchors.get(target, set()):
            # game-dev-3 on #123: an #anchor must name something the page shows; a section's id is its anchor.
            out.append(f"{w}: links to {href}, but {target} has no section {anchor!r}")
    return out


@functools.cache
def _sibling(name):
    """A module beside this file, loaded by its path, so layout.py works however a caller loaded it (by name or by path)."""
    import importlib.util   # noqa: PLC0415
    if name in sys.modules and getattr(sys.modules[name], "__file__", None) == str(pathlib.Path(__file__).with_name(f"{name}.py")):
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(f"_sitekit_{name}", pathlib.Path(__file__).with_name(f"{name}.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


BANDS = ("light", "dark", "card")


def _menu_problems(menu, links, brand, publish=False):
    """The record's optional `menu` (site-kit#243): 1 to 8 entries, each exactly {label, href}, replacing the menu built from the
    pages. href is a page path (maybe with an #anchor, checked with the page links) or an https:// address. A starter's
    href may be a {{placeholder:...}} until publish (site-kit#349: the product starter's sign-in link to the app), shown as
    a link with no address, as a placeholder button is."""
    if not (isinstance(menu, list) and 1 <= len(menu) <= 8):
        return ["menu must be a list of 1 to 8 entries"]
    out = []
    if brand is not None and (brand.get("header") or {}).get("nav_home"):
        out.append("menu is set, so the brand's header.nav_home is refused: list Home in the menu")
    for i, entry in enumerate(menu):
        out += _entry_problems(entry, f"menu[{i}]", links, waits=True)
        if publish and isinstance(entry, dict) and PLACEHOLDER.search(json.dumps(entry)):
            out.append(f"menu[{i}]: still holds a {{{{placeholder:...}}}}")
    return out


def _entry_problems(entry, w, links, waits=False):
    """One {label, href} entry of the record's menu or a footer column's links; waits: its href may be a placeholder."""
    if not isinstance(entry, dict) or set(entry) != {"label", "href"} or not all(isinstance(v, str) for v in entry.values()):
        return [f'{w}: an entry is {{"label": text, "href": address}}']
    out = []
    if blank(entry["label"]) or len(entry["label"]) > 40 or LINE_BREAK.search(entry["label"]):
        out.append(f"{w}: label must be words on one line, at most 40 characters")
    if PAGE_HREF.fullmatch(entry["href"]):
        links.append((w, entry["href"]))
    elif waits and PLACEHOLDER.fullmatch(entry["href"]):
        pass
    elif entry["href"] == SIGN_IN:
        pass
    elif not (entry["href"].startswith("https://") and SAFE_HREF.fullmatch(entry["href"])):
        out.append(f"{w}: href must be a page path (with an optional #anchor), an https:// address, or {SIGN_IN}")
    return out


def _footer_problems(footer, links):
    """The record's optional `footer` (site-kit#243): {"columns": [1 to 3 of {"heading", "links": [1 to 6 entries]}]}, and
    "layout": "row" for every link in one centred row that wraps (trenzbarbershop#34), "columns" (the default) otherwise.
    "note" (site-kit#424) is one line of small print after the links, plain text: no markup, no line break. "family": true
    (site-kit#428) adds the Super Intelligent family's row from the vendored .sitekit/family.json (family.py)."""
    if not (isinstance(footer, dict) and "columns" in footer and set(footer) <= {"columns", "layout", "note", "family"}
            and isinstance(footer["columns"], list) and 1 <= len(footer["columns"]) <= 3):
        return ['footer must be {"columns": [1 to 3 columns]} and may have "layout": "row" or "columns", a "note", and "family": true']
    if "family" in footer and footer["family"] is not True:
        return ['footer.family is true (the Super Intelligent family row) or left out']
    if footer.get("layout", "columns") not in {"columns", "row"}:
        return ['footer.layout is "row" (one centred row of links that wraps) or "columns" (the default)']
    out = []
    if "note" in footer:
        n = footer["note"]
        if not isinstance(n, str) or blank(n) or len(n) > 200 or LINE_BREAK.search(n) or "<" in n or ">" in n:
            out.append("footer.note must be plain words on one line, 1 to 200 characters, with no < or >")
    for i, col in enumerate(footer["columns"]):
        w = f"footer.columns[{i}]"
        if not isinstance(col, dict) or set(col) != {"heading", "links"} or not isinstance(col["heading"], str) or not isinstance(col["links"], list):
            out.append(f'{w}: a column is {{"heading": text, "links": [entries]}}')
            continue
        if blank(col["heading"]) or len(col["heading"]) > 40 or LINE_BREAK.search(col["heading"]):
            out.append(f"{w}: heading must be words on one line, at most 40 characters")
        if not 1 <= len(col["links"]) <= 6:
            out.append(f"{w}: a column holds 1 to 6 links")
        for j, entry in enumerate(col["links"][:6]):
            out += _entry_problems(entry, f"{w}.links[{j}]", links)
    return out


def _band_problems(band, where, brand):
    """A section's optional `band` (site-kit#243): light or dark need that band in the brand's `bands`, card needs
    `colours.surface`. Without the brand record only the value is checked."""
    if band not in BANDS:
        return [f"{where}: band must be light, dark or card"]
    if brand is None:
        return []
    if band == "card":
        return [] if "surface" in (brand.get("colours") or {}) else [f"{where}: band card needs colours.surface in the brand"]
    return [] if band in (brand.get("bands") or {}) else [f"{where}: band {band} is not defined in the brand's bands"]


CONFIG_PATH = re.compile(r"^[A-Za-z0-9_-][A-Za-z0-9_.-]*(/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*\.json\Z")


def _slot_map_problems(record, blocks):
    """The record's "slots" (site-kit#223): which plugin fills each slot, with which committed config file. Every slot on
    a page has one, and every one names a slot that is on a page, so a dues page can't be built without its button."""
    given = record.get("slots", {})
    if not isinstance(given, dict):
        return ['slots is {"name": {"plugin": name, "config": "path/to/config.json"}}']
    out = []
    for name, m in given.items():
        if not SLOT_NAME.fullmatch(name):
            out.append(f"slots: {name!r} is not 1 to 40 lowercase letters, digits and hyphens")
        elif isinstance(m, dict) and set(m) == {"plugin"} and isinstance(m["plugin"], str) and NAME.fullmatch(m["plugin"]):
            pass   # site-kit#531: a page plugin fills this slot in its page.html filter (build.with_page_plugins holds it)
        elif not (isinstance(m, dict) and set(m) == {"plugin", "config"} and isinstance(m["plugin"], str)
                  and NAME.fullmatch(m["plugin"]) and isinstance(m["config"], str) and CONFIG_PATH.fullmatch(m["config"])
                  and ".." not in m["config"].split("/")):
            out.append(f'slots.{name}: is {{"plugin": a plugin folder\'s name, "config": a .json path inside the site}}, or '
                       '{"plugin": a page plugin\'s name} for one that fills it as it filters the page')
    try:
        placed = {n for names in slots(record, blocks).values() for n in names if isinstance(n, str)}
    except (KeyError, TypeError, AttributeError):   # a malformed page or block is reported by its own check
        return out
    out += [f"slot {n!r} is on a page, but slots doesn't say which plugin fills it" for n in sorted(placed - set(given))]
    out += [f"slots.{n}: no page carries this slot" for n in sorted(set(given) - placed) if SLOT_NAME.fullmatch(n)]
    return out


def _slot_field(node):
    """The {prop} a tree's slot group names, or None."""
    if not isinstance(node, dict):
        return None
    if "slot" in node:
        return node["slot"]
    return next((f for k in node.get("children", []) if (f := _slot_field(k))), None)


def slot_name(spec, props):
    """The plugin slot a section carries (site-kit#223), or None for a block with no slot."""
    field = _slot_field(spec["tree"])
    if field is None:
        return None
    m = SLOT.fullmatch(field)
    return props.get(m.group(1)) if m else None


# site-kit#383: a section's "from" and "until" are full times with their offset, so the time zone is never guessed.
# The hour is 00 to 23: Python 3.13 and later read 24:00:00 as the next midnight while 3.12 refuses it, so the record's
# meaning would hang on the checking Python (maint-review-2 on site-agent#235). Refused everywhere instead.
GATE_TIME = re.compile(r"^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$")
GATE_EXAMPLE = "2027-01-01T00:00:00-07:00"


def gate_time(value):
    """A from/until value as an aware datetime, or None when it isn't a full time with its offset."""
    if not isinstance(value, str) or not GATE_TIME.fullmatch(value):
        return None
    try:
        return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _gate_problems(sec, where):
    out = [f'{where}: "{k}" must be a full time with its offset, like {GATE_EXAMPLE}' for k in ("from", "until")
           if k in sec and gate_time(sec[k]) is None]
    if not out and "from" in sec and "until" in sec and gate_time(sec["until"]) <= gate_time(sec["from"]):
        out.append(f'{where}: "until" must be after "from"')
    return out


def shown_at(sec, now):
    """Whether a build at `now` includes the section: from its "from" (inclusive) to its "until" (exclusive)."""
    start, end = gate_time(sec.get("from")), gate_time(sec.get("until"))
    return (start is None or now >= start) and (end is None or now < end)


def at(record, now, blocks):
    """The record as a build at `now` shows it (site-kit#383). A section outside its from/until window is dropped, and so is
    a slot mapping that only dropped sections carried, so nothing of it ships: no HTML, no twin, no plugin output. Checked
    records only; `record` itself is not changed."""
    out = copy.deepcopy(record)
    for page in out["pages"]:
        page["sections"] = [s for s in page["sections"] if shown_at(s, now)]
    if isinstance(out.get("slots"), dict):
        carried = {n for names in slots(out, blocks).values() for n in names}
        out["slots"] = {k: v for k, v in out["slots"].items() if k in carried}
    return out


def build_time(env=None, publish=False):
    """The time a build decides its dated sections at: SITEKIT_BUILD_AT (a dry run of another day), else the clock. A publish
    build refuses SITEKIT_BUILD_AT, so a value left in a build's environment can never ship a dated form early."""
    value = (os.environ if env is None else env).get("SITEKIT_BUILD_AT")
    if value is None:
        return datetime.datetime.now(datetime.timezone.utc)
    if publish:
        raise LayoutError("SITEKIT_BUILD_AT is for a dry run: a --publish build decides at the clock, so unset it")
    t = gate_time(value)
    if t is None:
        raise LayoutError(f"SITEKIT_BUILD_AT must be a full time with its offset, like {GATE_EXAMPLE}")
    return t


def gated(record):
    """Whether any section of the record carries a from or an until."""
    return any("from" in s or "until" in s for p in record.get("pages", []) for s in p.get("sections", []) if isinstance(s, dict))


def slots(record, blocks):
    """{page path: [slot names]} for a record, in page order (the build fills them and checks them both ways)."""
    out = {}
    for page in record["pages"]:
        names = [slot_name(blocks[s["block"].partition("@")[0]], s["props"]) for s in page["sections"]]
        out[page["path"]] = [n for n in names if n is not None]
    return out


def template_require(record):
    """The routes the record's template says a site must keep (game-dev-3 on #121: never only a CLI flag to forget).
    [] when the record names no starter; problems() refuses such a record, so the routes cannot be dropped that way."""
    name = record.get("template") if isinstance(record, dict) else None
    if not (isinstance(name, str) and NAME.fullmatch(name)):
        return []
    f = STARTERS / name / "template.json"
    if not f.is_file():
        return []
    req = json.loads(f.read_text(encoding="utf-8")).get("require", [])
    return [r for r in req if isinstance(r, str) and PATH.fullmatch(r)]


def check(record_path, publish=False, require=(), blocks_dir=BLOCKS, types_path=PAGE_TYPES, brand=None):
    """Raise LayoutError naming every problem with the record at `record_path`."""
    try:
        record = json.loads(pathlib.Path(record_path).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise LayoutError(f"{record_path}: cannot read the record ({e})") from None
    found = problems(record, load_blocks(blocks_dir), json.loads(pathlib.Path(types_path).read_text(encoding="utf-8")),
                     publish, require, brand)
    if found:
        raise LayoutError(f"{record_path}:\n  " + "\n  ".join(found))
    return record


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("record", nargs="?")
    ap.add_argument("--blocks", action="store_true", help="check every block.json and stop")
    ap.add_argument("--publish", action="store_true", help="also fail on any {{placeholder:...}} left")
    ap.add_argument("--require", action="append", default=[], metavar="PATH", help="a page the site must have")
    args = ap.parse_args(argv)
    try:
        if args.blocks or not args.record:
            print(f"blocks ok: {len(load_blocks())}")
            return 0
        check(args.record, args.publish, args.require)
        print(f"layout ok: {args.record}")
        return 0
    except LayoutError as e:
        print(f"layout: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
