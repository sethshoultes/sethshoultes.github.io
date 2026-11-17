"""Site templates, step 1b (site-kit#119, superintelligentfoo#175): block moves as ops on the layout record.

A person dragging a block in the studio, and an agent asked to "put the reviews above the services", both send a short
list of ops. The list is applied to a copy of the record, then the WHOLE result is checked once with layout.problems:
an op list is atomic, so a move across pages (remove, then add) may pass through a state that would fail on its own,
and is committed or refused as a whole. Nothing is written unless the result is valid.

    {"op": "move",        "page": "/", "id": "s3", "before": "s1"}        (or "after"; never a position, so no index race)
    {"op": "add",         "page": "/", "block": "cta@1", "props": {...}}   ("before"/"after" optional: the end otherwise;
                                                                            "id" optional: a new random s<hex> otherwise)
    {"op": "remove",      "page": "/", "id": "s5"}
    {"op": "set",         "page": "/", "id": "s2", "props": {"heading": "..."}}   (a null value drops an optional prop)
    {"op": "add-page",    "path": "/about/", "type": "about", "title": "About"}   ("description", "before"/"after" optional;
                                                                            "gallery": true makes a design-gallery page,
                                                                            with index false and menu none)
    {"op": "remove-page", "path": "/about/"}
    {"op": "set-page",    "path": "/about/", "title": "About us"}          (title and/or description; null drops a description)
    {"op": "promote-page", "path": "/designs/bold/"}   (site-kit#387: the picked candidate's sections become the home page's,
                                                         which keeps its type, title and description; every gallery page goes,
                                                         with any slot mapping only they carried. A page under /designs/
                                                         that isn't marked gallery is never dropped: the pick is refused)

    python3 ops.py .sitekit/layout.json ops.json [--require /contact/ ...]

Standard library only.
"""
import argparse
import copy
import json
import os
import pathlib
import secrets
import stat
import sys
import tempfile

import layout

MAX_OPS = 100
KEYS = {"move": ({"op", "page", "id"}, {"before", "after"}), "add": ({"op", "page", "block", "props"}, {"id", "before", "after"}),
        "remove": ({"op", "page", "id"}, set()), "set": ({"op", "page", "id", "props"}, set()),
        "add-page": ({"op", "path", "type", "title"}, {"description", "gallery", "before", "after"}), "remove-page": ({"op", "path"}, set()),
        "set-page": ({"op", "path"}, {"title", "description"}), "promote-page": ({"op", "path"}, set())}
DESIGNS = "/designs/"   # a design gallery and its candidate homepages, each page marked "gallery": true (site-kit#387)


def _page(record, path):
    for p in record["pages"]:
        if isinstance(p, dict) and p.get("path") == path:
            if not isinstance(p.get("sections"), list):
                raise layout.LayoutError(f"page {path} has no sections list")
            return p
    raise layout.LayoutError(f"no page {path}")


def _index(items, key, value, what):
    for i, it in enumerate(items):
        if isinstance(it, dict) and it.get(key) == value:
            return i
    raise layout.LayoutError(f"no {what} {value}")


def _place(items, item, key, op, what):
    """Insert `item` before or after the item `op` names (exactly one of them), or at the end when it names neither."""
    where = [k for k in ("before", "after") if k in op]
    if len(where) > 1:
        raise layout.LayoutError("give before or after, not both")
    if not where:
        items.append(item)
        return
    i = _index(items, key, op[where[0]], what)
    items.insert(i if where[0] == "before" else i + 1, item)


def _new_id(record):
    """A fresh random id (32 random bits), never one in use, and so almost never one a removed section had: game-dev-3 on
    #122 found that reusing ids let a stale "move s3" act on the new block. An explicit "id" on add is the caller's own
    choice; the studio and the agent leave it out."""
    used = {s.get("id") for p in record["pages"] for s in p.get("sections", []) if isinstance(s, dict)}
    while True:
        new = "s" + secrets.token_hex(4)
        if new not in used:
            return new


def _apply_one(record, op, blocks):
    if not isinstance(op, dict) or op.get("op") not in KEYS:
        raise layout.LayoutError(f"op must be one of {', '.join(KEYS)}")
    need, may = KEYS[op["op"]]
    if not need <= set(op) or set(op) - need - may:
        raise layout.LayoutError(f"{op['op']} takes {', '.join(sorted(need - {'op'}))}" + (f" and optionally {', '.join(sorted(may))}" if may else ""))
    kind = op["op"]
    if kind == "promote-page":
        path = op["path"]
        if not isinstance(path, str) or not path.startswith(DESIGNS) or path == DESIGNS:
            raise layout.LayoutError(f"promote-page takes a candidate design's path, {DESIGNS}<slug>/")
        picked, home = _page(record, path), _page(record, "/")
        if picked.get("gallery") is not True:
            raise layout.LayoutError(f"page {path} is not a candidate design (it has no \"gallery\": true)")
        unmarked = [p["path"] for p in record["pages"] if str(p.get("path", "")).startswith(DESIGNS) and p.get("gallery") is not True]
        if unmarked:
            raise layout.LayoutError(f"{', '.join(unmarked)} sits under {DESIGNS} without \"gallery\": true, so the pick would drop it; move it first")
        before = {n for names in layout.slots(record, blocks).values() for n in names}
        home["sections"] = picked["sections"]   # the picked page is dropped below, and apply works on a copy
        record["pages"] = [p for p in record["pages"] if p.get("gallery") is not True]
        if isinstance(record.get("slots"), dict):   # a slot only a dropped candidate carried goes with it (maint-review-2 on #390)
            after = {n for names in layout.slots(record, blocks).values() for n in names}
            record["slots"] = {k: v for k, v in record["slots"].items() if k in after or k not in before}
        return
    if kind in {"add-page", "remove-page", "set-page"}:
        pages = record["pages"]
        if kind == "remove-page":
            del pages[_index(pages, "path", op["path"], "page")]
        elif kind == "set-page":
            page = pages[_index(pages, "path", op["path"], "page")]
            for k in ("title", "description"):
                if k in op:
                    if op[k] is None:
                        page.pop(k, None)
                    else:
                        page[k] = op[k]
        else:
            if any(isinstance(p, dict) and p.get("path") == op["path"] for p in pages):
                raise layout.LayoutError(f"page {op['path']} already exists")
            new = {"path": op["path"], "type": op["type"], "title": op["title"], "sections": []}
            if "description" in op:
                new["description"] = op["description"]
            if "gallery" in op:
                if op["gallery"] is not True:
                    raise layout.LayoutError("gallery is true, or left out")
                new.update(index=False, menu="none", gallery=True)
            _place(pages, new, "path", op, "page")
        return
    sections = _page(record, op["page"])["sections"]
    if kind == "remove":
        del sections[_index(sections, "id", op["id"], "section")]
    elif kind == "move":
        if "before" not in op and "after" not in op:
            raise layout.LayoutError("move needs before or after")
        if op["id"] in (op.get("before"), op.get("after")):
            raise layout.LayoutError("a section cannot move next to itself")
        sec = sections.pop(_index(sections, "id", op["id"], "section"))
        _place(sections, sec, "id", op, "section")
    elif kind == "add":
        if not isinstance(op["props"], dict):
            raise layout.LayoutError("props must be an object")
        _place(sections, {"id": op.get("id") or _new_id(record), "block": op["block"], "props": copy.deepcopy(op["props"])},
               "id", op, "section")
    elif kind == "set":
        if not isinstance(op["props"], dict):
            raise layout.LayoutError("props must be an object")
        props = sections[_index(sections, "id", op["id"], "section")].get("props")
        if not isinstance(props, dict):
            raise layout.LayoutError(f"section {op['id']} has no props object")
        for k, v in op["props"].items():
            if v is None:
                props.pop(k, None)
            else:
                props[k] = copy.deepcopy(v)


def apply(record, ops, blocks, page_types, require=()):
    """The record after every op, checked whole; LayoutError (and `record` untouched) if any op or the result is wrong."""
    if not isinstance(ops, list) or not ops or len(ops) > MAX_OPS:
        raise layout.LayoutError(f"ops must be a list of 1 to {MAX_OPS}")
    out = copy.deepcopy(record)
    if not isinstance(out, dict) or not isinstance(out.get("pages"), list):
        raise layout.LayoutError("the record has no pages")
    for i, op in enumerate(ops):
        try:
            _apply_one(out, op, blocks)
        except layout.LayoutError as e:
            raise layout.LayoutError(f"op {i}: {e}") from None
        except (TypeError, AttributeError, KeyError):
            raise layout.LayoutError(f"op {i}: not an op this record can take") from None
    found = layout.problems(out, blocks, page_types, require=require)
    if found:
        raise layout.LayoutError("the result is not allowed, so nothing changed:\n  " + "\n  ".join(found))
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("record")
    ap.add_argument("ops")
    ap.add_argument("--require", action="append", default=[], metavar="PATH")
    args = ap.parse_args(argv)
    try:
        record = json.loads(pathlib.Path(args.record).read_text(encoding="utf-8"))
        ops = json.loads(pathlib.Path(args.ops).read_text(encoding="utf-8"))
        result = apply(record, ops, layout.load_blocks(), json.loads(layout.PAGE_TYPES.read_text(encoding="utf-8")), args.require)
    except (OSError, ValueError) as e:
        print(f"ops: cannot read ({e})", file=sys.stderr)
        return 1
    except layout.LayoutError as e:
        print(f"ops: {e}", file=sys.stderr)
        return 1
    target = pathlib.Path(args.record)
    mode = stat.S_IMODE(target.stat().st_mode)   # keep the file's own mode (mkstemp makes 0600; game-dev-3 and game-dev-2 on #122)
    fd, tmp = tempfile.mkstemp(dir=target.parent, prefix=".layout-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
            f.flush()
            os.fsync(f.fileno())   # on disk before the swap, so a power cut cannot leave an empty record
        os.chmod(tmp, mode)
        os.replace(tmp, target)   # all at once: a reader sees the old record or the new one, never half
    except BaseException:
        pathlib.Path(tmp).unlink(missing_ok=True)
        raise
    print(f"ops: {len(ops)} applied to {args.record}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
