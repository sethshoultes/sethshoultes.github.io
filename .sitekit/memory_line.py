#!/usr/bin/env python3
"""memory_line.py (site-kit#255): one memory line for a merged pull request, in the site's brain.

    PR_NUMBER=12 PR_TITLE='...' PR_MERGED_AT=2026-11-09T07:15:30Z PR_MERGED_BY=octocat PR_MERGE_SHA=<40 hex> \
        python3 -I .sitekit/memory_line.py

Vendored into the site by site_sync.py and run by its workflow (templates/site-memory.yml) on main after a pull request merges.
It writes `.agent/memory/<YYYY-MM>/<YYYY-MM-DD>-<HHMMSS>-<id>.md`, the id being the merge commit's first 8 hex (the site
agent's `read_brain` reads only a file whose id is 8 lowercase hex), holding one line, `- <date>: PR <N>, merged by <login>,
titled "<title>"`: the site agent's own memory format (site-agent src/tools.js memoryNote), one file per change, so two writers never
conflict and `read_brain` reads it with the rest of the brain. It writes nothing for a site with no SOUL.md (the site agent
does the same: memory belongs to a site that has a brain), nothing for a site whose .sitekit/features.json says
`"memory_lines": false` (its open pull requests must stay up to date with main), and nothing when the file is already there.

The title is the pull request's, so it is untrusted text, and the site agent reads memory before it works: it reaches this
script only through the environment, never the workflow's shell; it is cut to plain words here (no line breaks, control or
invisible characters, no markup and no double quote); and it is written last, inside quotes, after the facts this script
checked, so it reads as the title someone gave the change and never as the line's own words. The number, the time and the login are checked against their exact shapes and refused otherwise.
Exit 0 when a line is written or rightly skipped, 1 on a value in the wrong shape.
"""
import json
import os
import pathlib
import re
import sys
import unicodedata

NUMBER = re.compile(r"[1-9][0-9]{0,6}\Z")
MERGED_AT = re.compile(r"(\d{4}-\d{2})-\d{2}T\d{2}:\d{2}:\d{2}Z\Z")
SHA = re.compile(r"[0-9a-f]{40}\Z")
LOGIN = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})(?:\[bot\])?\Z")
MARKUP = re.compile(r"[\[\]()<>`#*_|\\\"]")   # the site agent's markup set, plus " so a title cannot close its quotes
#: Quote-like symbols that are not in Unicode's opening or closing punctuation (Pi, Pf), dropped with them.
QUOTE_SYMBOLS = set("\u275b\u275c\u275d\u275e\u301d\u301e\u301f")
TITLE_CHARS = 150


def plain(text, limit):
    """The site agent's plainText: every control, format, separator or space character becomes one space, markup goes.

    NFKC first, so a fullwidth or compatibility look-alike becomes the character it imitates (a fullwidth quote becomes `"`
    and is dropped with the markup); then every opening or closing quotation mark (Pi, Pf) and quote symbol goes too, so
    nothing in a title can pose as the quote that closes it."""
    text = unicodedata.normalize("NFKC", text)
    out = "".join(" " if unicodedata.category(c)[0] in "CZ" else c for c in text
                  if unicodedata.category(c) not in ("Pi", "Pf") and c not in QUOTE_SYMBOLS)
    return re.sub(r"\s+", " ", MARKUP.sub("", out)).strip()[:limit]


def line(number, title, merged_at, merged_by, merge_sha):
    """The memory file's path and text, or a ValueError naming the value in the wrong shape."""
    if not NUMBER.match(number):
        raise ValueError(f"PR_NUMBER {number!r} is not a pull request number")
    when = MERGED_AT.match(merged_at)
    if not when:
        raise ValueError(f"PR_MERGED_AT {merged_at!r} is not a UTC time like 2026-11-09T07:15:30Z")
    if not LOGIN.match(merged_by):
        raise ValueError(f"PR_MERGED_BY {merged_by!r} is not a GitHub login")
    if not SHA.match(merge_sha):
        raise ValueError(f"PR_MERGE_SHA {merge_sha!r} is not a full commit sha")
    words = plain(title, TITLE_CHARS) or "a change"
    day, time = merged_at[:10], merged_at[11:19].replace(":", "")
    path = pathlib.PurePosixPath(".agent/memory", when.group(1), f"{day}-{time}-{merge_sha[:8]}.md")
    return path, f'- {day}: PR {number}, merged by {merged_by.removesuffix("[bot]")}, titled "{words}"\n'


def refuse_unsafe(root, rel):
    """Raise OSError when writing `root/rel` would go through a symlink (any folder on the way, or the file itself) or need a
    folder where a file is. The one path check for everything that writes into a site's brain (site-kit#255: this script and
    brain.py), so nothing is ever written outside the site's own tree."""
    root = pathlib.Path(root)
    parts = pathlib.PurePosixPath(rel).parts
    for n in range(1, len(parts)):
        p = root.joinpath(*parts[:n])
        if p.is_symlink():
            raise OSError(f"{'/'.join(parts[:n])} is a symlink; nothing written")
        if p.exists() and not p.is_dir():
            raise OSError(f"{'/'.join(parts[:n])} is a file where a folder must go; nothing written")
    if (root / rel).is_symlink():
        raise OSError(f"{rel} is a symlink; nothing written")


def main(root="."):
    root = pathlib.Path(root)
    env = {k: os.environ.get(k, "") for k in ("PR_NUMBER", "PR_TITLE", "PR_MERGED_AT", "PR_MERGED_BY", "PR_MERGE_SHA")}
    try:
        path, text = line(env["PR_NUMBER"], env["PR_TITLE"], env["PR_MERGED_AT"], env["PR_MERGED_BY"], env["PR_MERGE_SHA"])
    except ValueError as err:
        print(f"memory_line: {err}", file=sys.stderr)
        return 1
    try:
        features = json.loads((root / ".sitekit/features.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        features = {}
    if isinstance(features, dict) and features.get("memory_lines") is False:
        print('memory_line: .sitekit/features.json says "memory_lines": false; no memory line')
        return 0
    if not (root / "SOUL.md").is_file():
        print("memory_line: no SOUL.md, so no memory: the site has no brain yet (site-kit#255)")
        return 0
    target = root / path
    try:
        refuse_unsafe(root, path)
    except OSError as err:
        print(f"memory_line: {err}", file=sys.stderr)
        return 1
    if target.exists():
        print(f"memory_line: {path} is already there")
        return 0
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")
    print(f"memory_line: wrote {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
