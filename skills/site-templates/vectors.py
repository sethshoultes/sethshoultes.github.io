"""Site templates, step 2 (superintelligentfoo#175): the op vectors that hold every other implementation of ops.py to it.

The site agent's Worker is JavaScript and cannot run this folder, but its tool and the studio's drag handles must refuse
a bad op list at once. So site-agent carries a port of ops.apply and layout.problems, and this file is what keeps the
port honest: each case is an op list on the local-trades starter, run through the real ops.apply here, with its exact
result or its exact refusal written down. A port must give the same answer for every case.

    python3 vectors.py            writes ops-vectors.json next to this file
    python3 vectors.py --check    exits 1 when ops-vectors.json is not what this would write (the test runs it)

Every "add" names its id, so the output never depends on a random one. Cases marked "exact": false are malformed input
(a lookup handle that isn't text): a port must refuse them, but need not copy Python's wording of a list. A
multi-problem refusal lists its problems in layout.problems' order, which is part of the exact text. layout.py in the
site's own CI stays the backstop for anything a port gets wrong. Standard library only.
"""
import argparse
import copy
import json
import pathlib
import sys

import layout
import ops

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "ops-vectors.json"
STARTER = "local-trades"

CTA = {"heading": "Call today", "button": {"text": "Call", "href": "tel:+18015550100"}}

# (name, ops, exact). The base is the local-trades starter, as shipped.
CASES = [
    # ---- ops that apply
    ("move reviews above services", [{"op": "move", "page": "/", "id": "reviews", "before": "services"}], True),
    ("move hero after questions", [{"op": "move", "page": "/", "id": "hero", "after": "questions"}], True),
    ("add a cta at the end", [{"op": "add", "page": "/", "block": "cta@1", "id": "extra-call", "props": CTA}], True),
    ("add a cta before the services", [{"op": "add", "page": "/", "block": "cta@1", "id": "early-call", "before": "services", "props": CTA}], True),
    ("remove the questions", [{"op": "remove", "page": "/", "id": "questions"}], True),
    ("set a heading", [{"op": "set", "page": "/", "id": "call", "props": {"heading": "Ring us now"}}], True),
    ("a lone surrogate in a heading is refused", [{"op": "set", "page": "/", "id": "call", "props": {"heading": "Ring \ud800 us"}}], True),
    ("set drops an optional prop with null", [{"op": "set", "page": "/services/", "id": "services-list", "props": {"intro": None}}], True),
    ("add, rename and remove a page", [{"op": "add-page", "path": "/gallery/", "type": "page", "title": "Our work", "after": "/about/"},
                                       {"op": "set-page", "path": "/gallery/", "title": "Recent jobs", "description": "Jobs we finished"},
                                       {"op": "set-page", "path": "/gallery/", "description": None},
                                       {"op": "remove-page", "path": "/gallery/"}], True),
    ("move a section across pages (remove, then add)", [{"op": "remove", "page": "/about/", "id": "about-call"},
                                                        {"op": "add", "page": "/services/", "block": "cta@1", "id": "about-call", "after": "services-hero", "props": CTA}], True),
    ("a step that fails alone passes in a list", [{"op": "remove", "page": "/", "id": "hero"},
                                                  {"op": "add", "page": "/", "block": "hero@1", "id": "new-hero", "before": "services",
                                                   "props": {"heading": "Doors fixed today", "lead": "Same-day repairs", "cta": {"text": "Call", "href": "tel:+18015550100"}}}], True),
    # ---- ops refused before the record is checked
    ("an unknown op", [{"op": "swap", "page": "/", "id": "hero"}], True),
    ("a missing key", [{"op": "move", "page": "/", "before": "services"}], True),
    ("an extra key", [{"op": "remove", "page": "/", "id": "hero", "colour": "red"}], True),
    ("move with neither before nor after", [{"op": "move", "page": "/", "id": "hero"}], True),
    ("move next to itself", [{"op": "move", "page": "/", "id": "hero", "after": "hero"}], True),
    ("before and after both", [{"op": "move", "page": "/", "id": "hero", "before": "call", "after": "services"}], True),
    ("no such section", [{"op": "remove", "page": "/", "id": "s9"}], True),
    ("no such page", [{"op": "remove", "page": "/nowhere/", "id": "hero"}], True),
    ("no such anchor section", [{"op": "move", "page": "/", "id": "hero", "before": "s9"}], True),
    ("add-page on a page that exists", [{"op": "add-page", "path": "/about/", "type": "about", "title": "About"}], True),
    ("props not an object", [{"op": "set", "page": "/", "id": "call", "props": ["heading"]}], True),
    ("an empty list", [], True),
    ("too many ops", [{"op": "set", "page": "/", "id": "call", "props": {"heading": "Call"}}] * (ops.MAX_OPS + 1), True),
    ("the second op fails, so nothing changes", [{"op": "move", "page": "/", "id": "reviews", "before": "services"},
                                                 {"op": "remove", "page": "/", "id": "s9"}], True),
    # ---- ops that apply, but the whole result is refused
    ("removing the contact page", [{"op": "remove-page", "path": "/contact/"}], True),
    ("a required prop dropped", [{"op": "set", "page": "/", "id": "call", "props": {"heading": None}}], True),
    ("an unknown block", [{"op": "add", "page": "/", "block": "carousel@1", "id": "spin", "props": {}}], True),
    ("a block's old major", [{"op": "add", "page": "/", "block": "cta@0", "id": "old-call", "props": CTA}], True),
    ("an unknown prop", [{"op": "add", "page": "/", "block": "cta@1", "id": "odd-call", "props": {**CTA, "colour": "red"}}], True),
    ("an id used twice", [{"op": "add", "page": "/about/", "block": "cta@1", "id": "call", "props": CTA}], True),
    ("a link to a page that isn't there", [{"op": "set", "page": "/", "id": "call", "props": {"button": {"text": "See", "href": "/prices/"}}}], True),
    ("an anchor to a section that isn't there", [{"op": "set", "page": "/", "id": "call", "props": {"button": {"text": "Reach us", "href": "/contact/#map"}}}], True),
    ("removing the section an anchor names", [{"op": "remove", "page": "/contact/", "id": "reach"}], True),
    ("a title too long", [{"op": "set-page", "path": "/about/", "title": "A" * 71}], True),
    ("a title on two lines", [{"op": "set-page", "path": "/about/", "title": "About\nus"}], True),
    ("a page type's required block removed", [{"op": "remove", "page": "/", "id": "hero"}], True),
    ("a page path that isn't a path", [{"op": "add-page", "path": "/Gallery", "type": "page", "title": "Gallery"}], True),
    ("an unknown page type", [{"op": "add-page", "path": "/gallery/", "type": "carousel", "title": "Gallery"}], True),
    ("a bad section id", [{"op": "add", "page": "/", "block": "cta@1", "id": "Big Call", "props": CTA}], True),
    # a trailing newline is not a valid ending (site-kit#226): Python's $ matches before a final "\n", so these use fullmatch
    ("a section id with a trailing newline", [{"op": "add", "page": "/", "block": "cta@1", "id": "late-call\n", "props": CTA}], True),
    ("a page path with a trailing newline", [{"op": "add-page", "path": "/gallery/\n", "type": "page", "title": "Gallery"}], True),
    ("a link with a trailing newline", [{"op": "set", "page": "/", "id": "call", "props": {"button": {"text": "See", "href": "/about/\n"}}}], True),
    ("an https link with a trailing newline", [{"op": "set", "page": "/", "id": "call", "props": {"button": {"text": "See", "href": "https://example.com/\n"}}}], True),
    ("a heading over its max", [{"op": "set", "page": "/", "id": "call", "props": {"heading": "x" * 91}}], True),
    # ---- text@1 and list@1 (site-kit#223): a text item may have any of its three parts, but not none of them
    ("add a text section with a subheading and a paragraph", [{"op": "add", "page": "/about/", "block": "text@1", "id": "bylaws-1",
        "props": {"heading": "Bylaws", "body": [{"subheading": "Article I", "paragraph": "The name is the guild's."}, {"paragraph": "Second part"}]}}], True),
    ("add a list section", [{"op": "add", "page": "/about/", "block": "list@1", "id": "bylaws-2", "props": {"points": [{"point": "One"}, {"point": "Two"}]}}], True),
    ("a text item with nothing in it", [{"op": "add", "page": "/about/", "block": "text@1", "id": "empty-text",
        "props": {"body": [{"paragraph": "Kept"}, {"subheading": "  ", "image": {"src": "", "alt": ""}}]}}], True),
    ("a list with no points", [{"op": "add", "page": "/about/", "block": "list@1", "id": "empty-list", "props": {"points": []}}], True),
    # ---- text@1.2 (site-kit#526): a paragraph may carry [words](href) links, held to a link's rule
    ("a paragraph with a page link and a mailto link", [{"op": "add", "page": "/about/", "block": "text@1", "id": "links-1",
        "props": {"body": [{"paragraph": "See [the home page](/) or write to [us](mailto:hello@example.com)."}]}}], True),
    ("a paragraph link to javascript:", [{"op": "add", "page": "/about/", "block": "text@1", "id": "links-2",
        "props": {"body": [{"paragraph": "Click [here](javascript:alert(1))"}]}}], True),
    ("a paragraph link to a page that isn't there", [{"op": "add", "page": "/about/", "block": "text@1", "id": "links-3",
        "props": {"body": [{"paragraph": "See [prices](/prices/)."}]}}], True),
    ("a paragraph link with an empty address", [{"op": "add", "page": "/about/", "block": "text@1", "id": "links-4",
        "props": {"body": [{"paragraph": "See [prices]()."}]}}], True),
    # ---- slot@1 (site-kit#223): a named place a plugin fills; the name is short, plain and once per page
    ("a slot no record mapping fills is refused (slots is set in the record, never by an op)", [{"op": "add", "page": "/about/", "block": "slot@1", "id": "pay-here", "props": {"name": "dues-2027"}}], True),
    ("a slot name with a space", [{"op": "add", "page": "/about/", "block": "slot@1", "id": "pay-here", "props": {"name": "dues 2027"}}], True),
    ("a slot name twice on a page", [{"op": "add", "page": "/about/", "block": "slot@1", "id": "pay-a", "props": {"name": "dues"}},
                                     {"op": "add", "page": "/about/", "block": "slot@1", "id": "pay-b", "props": {"name": "dues"}}], True),
    # ---- where a JavaScript port naturally differs (game-review and site-dev on #129): lengths count characters (code
    # points), bools and numbers are not text, a Unicode line separator is a line break, and the page ops' edges
    ("a title of 70 characters beyond the BMP", [{"op": "set-page", "path": "/about/", "title": "\U0001F525" * 70}], True),
    ("a title of 71 characters beyond the BMP", [{"op": "set-page", "path": "/about/", "title": "\U0001F525" * 71}], True),
    ("a heading that is true", [{"op": "set", "page": "/", "id": "call", "props": {"heading": True}}], True),
    ("a title that is a number", [{"op": "set-page", "path": "/about/", "title": 1.0}], True),
    ("a title with a line separator", [{"op": "set-page", "path": "/about/", "title": "About\u2028us"}], True),
    ("a block that is a number", [{"op": "add", "page": "/", "block": 5, "id": "five", "props": {}}], True),
    ("set-page cannot set the menu", [{"op": "set-page", "path": "/about/", "menu": "footer"}], True),
    ("set-page cannot set the menu to none either", [{"op": "set-page", "path": "/about/", "menu": "none"}], True),
    ("removing the home page", [{"op": "remove-page", "path": "/"}], True),
    # promote-page (site-kit#387): a marked candidate design becomes the home page, and every gallery page goes
    ("promote a candidate design", [{"op": "add-page", "path": "/designs/bold/", "type": "home", "title": "Bold", "gallery": True}, {"op": "add", "page": "/designs/bold/", "block": "hero@1", "id": "bold-hero", "props": {"heading": "Bold doors"}}, {"op": "add-page", "path": "/designs/calm/", "type": "home", "title": "Calm", "gallery": True}, {"op": "add", "page": "/designs/calm/", "block": "hero@1", "id": "calm-hero", "props": {"heading": "Calm doors"}},
                                    {"op": "promote-page", "path": "/designs/bold/"}], True),
    ("promote-page takes only a candidate design", [{"op": "promote-page", "path": "/about/"}], True),
    ("promote-page of the gallery itself", [{"op": "promote-page", "path": "/designs/"}], True),
    ("promote-page of a design that isn't there", [{"op": "promote-page", "path": "/designs/nope/"}], True),
    ("promote-page with a path that isn't text", [{"op": "promote-page", "path": None}], True),
    ("promote-page of an unmarked page under /designs/", [{"op": "add-page", "path": "/designs/kitchen/", "type": "home", "title": "Kitchens"},
                                                         {"op": "add", "page": "/designs/kitchen/", "block": "hero@1", "id": "kitchen-hero", "props": {"heading": "Kitchens"}}, {"op": "promote-page", "path": "/designs/kitchen/"}], True),
    ("promote-page never drops a real page under /designs/", [{"op": "add-page", "path": "/designs/bold/", "type": "home", "title": "Bold", "gallery": True}, {"op": "add", "page": "/designs/bold/", "block": "hero@1", "id": "bold-hero", "props": {"heading": "Bold doors"}},
                                                              {"op": "add-page", "path": "/designs/kitchen/", "type": "page", "title": "Kitchens"},
                                                              {"op": "promote-page", "path": "/designs/bold/"}], True),
    ("add-page gallery takes only true", [{"op": "add-page", "path": "/designs/x/", "type": "home", "title": "X", "gallery": "yes"}], True),
    ("add-page gallery makes a hidden marked page", [{"op": "add-page", "path": "/designs/", "type": "page", "title": "Designs", "gallery": True}], True),
    ("add-page gallery refuses false on a page that would pass", [{"op": "add-page", "path": "/designs/", "type": "page", "title": "Designs", "gallery": False}], True),
    ("a dropped candidate's slot mapping goes with it", [{"op": "add-page", "path": "/designs/bold/", "type": "home", "title": "Bold", "gallery": True}, {"op": "add", "page": "/designs/bold/", "block": "hero@1", "id": "bold-hero", "props": {"heading": "Bold doors"}}, {"op": "add-page", "path": "/designs/calm/", "type": "home", "title": "Calm", "gallery": True}, {"op": "add", "page": "/designs/calm/", "block": "hero@1", "id": "calm-hero", "props": {"heading": "Calm doors"}},
                                                         {"op": "add", "page": "/designs/calm/", "block": "slot@1", "id": "calm-pay", "props": {"name": "calm-pay"}},
                                                         {"op": "promote-page", "path": "/designs/bold/"}], True,
     {"slots": {"calm-pay": {"plugin": "payer", "config": "conf/pay.json"}}}),
    ("a stray slot mapping is still reported after a pick", [{"op": "add-page", "path": "/designs/bold/", "type": "home", "title": "Bold", "gallery": True},
                                                             {"op": "add", "page": "/designs/bold/", "block": "hero@1", "id": "bold-hero", "props": {"heading": "Bold doors"}},
                                                             {"op": "promote-page", "path": "/designs/bold/"}], True,
     {"slots": {"nobody": {"plugin": "payer", "config": "conf/x.json"}}}),
    # ---- keys a JavaScript object treats specially: a port must store and refuse them as Python does, not set a prototype
    ("a prop named __proto__", [{"op": "set", "page": "/", "id": "call", "props": {"__proto__": {"heading": "x"}}}], True),
    ("a prop named constructor", [{"op": "add", "page": "/", "block": "cta@1", "id": "p-call", "props": {**CTA, "constructor": {"x": 1}}}], True),
    ("an item field named constructor", [{"op": "set", "page": "/services/", "id": "services-list",
                                         "props": {"items": [{"name": "Springs", "text": "We fix them", "constructor": "x"}]}}], True),
    ("a page path that is a number", [{"op": "add-page", "path": 5, "type": "page", "title": "Five"}], True),
    ("an op key named __proto__", [{"op": "move", "page": "/", "id": "hero", "__proto__": {"before": "call"}}], True),
    # ---- unsafe addresses (site-dev and game-dev-3 on #129): the refusal an attacker aims at, so a port that lets any
    # link through fails here. A heading with markup is text, applied as is: escaping is the renderer's job
    ("a button href of javascript:alert(1)", [{"op": "set", "page": "/", "id": "call", "props": {"button": {"text": "Go", "href": 'javascript:alert(1)'}}}], True),
    ("a button href of JaVaScRiPt:alert(1)", [{"op": "set", "page": "/", "id": "call", "props": {"button": {"text": "Go", "href": 'JaVaScRiPt:alert(1)'}}}], True),
    ("a button href of http://example.com/", [{"op": "set", "page": "/", "id": "call", "props": {"button": {"text": "Go", "href": 'http://example.com/'}}}], True),
    ("a button href of //evil.example/", [{"op": "set", "page": "/", "id": "call", "props": {"button": {"text": "Go", "href": '//evil.example/'}}}], True),
    ("a button href of tel:", [{"op": "set", "page": "/", "id": "call", "props": {"button": {"text": "Go", "href": 'tel:'}}}], True),
    ("a button href of https://ok.example/a>b", [{"op": "set", "page": "/", "id": "call", "props": {"button": {"text": "Go", "href": 'https://ok.example/a>b'}}}], True),
    ("an image src of javascript:alert(1)", [{"op": "set", "page": "/", "id": "hero", "props": {"image": {"src": 'javascript:alert(1)', "alt": "A door"}}}], True),
    ("an image src of http://example.com/x.png", [{"op": "set", "page": "/", "id": "hero", "props": {"image": {"src": 'http://example.com/x.png', "alt": "A door"}}}], True),
    ("an image src of //evil.example/x.png", [{"op": "set", "page": "/", "id": "hero", "props": {"image": {"src": '//evil.example/x.png', "alt": "A door"}}}], True),
    ("an image src of https://", [{"op": "set", "page": "/", "id": "hero", "props": {"image": {"src": 'https://', "alt": "A door"}}}], True),
    ("an image src of /x/../../etc", [{"op": "set", "page": "/", "id": "hero", "props": {"image": {"src": '/x/../../etc', "alt": "A door"}}}], True),
    ("an image src of https://example.com/door.jpg", [{"op": "set", "page": "/", "id": "hero", "props": {"image": {"src": 'https://example.com/door.jpg', "alt": "A door"}}}], True),
    ("a heading with markup", [{"op": "set", "page": "/", "id": "call", "props": {"heading": "<script>x</script>"}}], True),
    # ---- an item list's count cap (game-dev-2 on #142: 500 items passed): the block's own max, else layout.MAX_ITEMS
    ("thirteen services, over the block's 12", [{"op": "set", "page": "/services/", "id": "services-list",
                                               "props": {"heading": "Our services", "items": [{"name": f"Service {i}"} for i in range(13)]}}], True),
    ("twelve services, at the block's cap", [{"op": "set", "page": "/services/", "id": "services-list",
                                             "props": {"heading": "Our services", "items": [{"name": f"Service {i}"} for i in range(12)]}}], True),
    # ---- names quoted the way Python's repr quotes them (game-dev-2 on #129): a quote in a name switches the quote style,
    # and a newline is written as \n
    ("a prop name with an apostrophe", [{"op": "set", "page": "/", "id": "call", "props": {"it's": "x"}}], True),
    ("a prop name with a double quote", [{"op": "set", "page": "/", "id": "call", "props": {'a"b': "x"}}], True),
    ("a prop name with both quotes", [{"op": "set", "page": "/", "id": "call", "props": {"it's \"x\"": "x"}}], True),
    ("a prop name with a newline", [{"op": "set", "page": "/", "id": "call", "props": {"x\ny": "x"}}], True),
    # ---- what Python's repr escapes (maint-review-2 on site-agent#129): every character str.isprintable() rejects is
    # written as \x, \u or \U, so an invisible character shows in the refusal; and refusals list names in code-point order
    ("a prop name with a zero-width space", [{"op": "set", "page": "/", "id": "call", "props": {'a\u200bb': "x"}}], True),
    ("a prop name with a no-break space", [{"op": "set", "page": "/", "id": "call", "props": {'a\xa0b': "x"}}], True),
    ("a prop name with a line separator", [{"op": "set", "page": "/", "id": "call", "props": {'a\u2028b': "x"}}], True),
    ("a prop name with a byte-order mark", [{"op": "set", "page": "/", "id": "call", "props": {'\ufeffa': "x"}}], True),
    ("a prop name with a C1 control", [{"op": "set", "page": "/", "id": "call", "props": {'a\x85b': "x"}}], True),
    ("a prop name with a tag character", [{"op": "set", "page": "/", "id": "call", "props": {'a\U000e0001b': "x"}}], True),
    ("a prop name with a private-use character beyond the BMP", [{"op": "set", "page": "/", "id": "call", "props": {'a\U0010fffdb': "x"}}], True),
    ("two unknown props, sorted by code point", [{"op": "set", "page": "/", "id": "call", "props": {"\U0001F525x": "x", "\uff01x": "x"}}], True),
    # ---- malformed input: a port must refuse it, in its own words
    ("an op that is a string", ["move"], False),
    ("a page that is a list", [{"op": "remove", "page": ["/"], "id": "hero"}], False),
    ("an id that is a number", [{"op": "move", "page": "/", "id": 3, "before": "services"}], False),
    ("ops that are not a list", {"op": "move"}, False),
]


def vectors():
    blocks = layout.load_blocks()
    types = json.loads(layout.PAGE_TYPES.read_text(encoding="utf-8"))
    base = json.loads((layout.STARTERS / STARTER / "layout.json").read_text(encoding="utf-8"))
    templates = {d.name: json.loads((d / "template.json").read_text(encoding="utf-8"))
                 for d in sorted(layout.STARTERS.iterdir()) if (d / "template.json").is_file()}
    cases = []
    for name, op_list, exact, *extra in CASES:
        over = extra[0] if extra else {}   # a case may start from base with a few top-level keys set (only "slots" today)
        start = {**base, **over}
        record = copy.deepcopy(start)
        try:
            out = {"result": ops.apply(record, op_list, blocks, types)}
        except layout.LayoutError as e:
            out = {"error": str(e)} if exact else {"refused": True}
        assert record == start, f"{name}: ops.apply changed its input"
        cases.append({"name": name, **({"base": start} if over else {}), "ops": op_list, **out})
    return {"about": "Generated by skills/site-templates/vectors.py from ops.py and layout.py: do not edit. Each case is "
                     "an op list on base (or on the case's own base, when it has one); a port of ops.apply must give the same result, or the same error text, or "
                     "(where only refused is given) refuse it.",
            "max_ops": ops.MAX_OPS, "blocks": blocks, "page_types": types, "templates": templates, "base": base, "cases": cases}


def text():
    # Keep the file UTF-8 with its words as written, but escape a lone surrogate (the refused case below holds one):
    # it has no UTF-8 form, and a JSON parser reads the \\udXXX escape back as the same half character.
    raw = json.dumps(vectors(), indent=1, ensure_ascii=False) + "\n"
    return layout.SURROGATE.sub(lambda m: f"\\u{ord(m.group()):04x}", raw)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--check", action="store_true", help="exit 1 when ops-vectors.json is stale")
    args = ap.parse_args(argv)
    want = text()
    if args.check:
        if not OUT.is_file() or OUT.read_text(encoding="utf-8") != want:
            print("ops-vectors.json is stale: run python3 skills/site-templates/vectors.py", file=sys.stderr)
            return 1
        print("ops-vectors.json is current")
        return 0
    OUT.write_text(want, encoding="utf-8")
    print(f"wrote {OUT.name}: {len(CASES)} cases")
    return 0


if __name__ == "__main__":
    sys.exit(main())
