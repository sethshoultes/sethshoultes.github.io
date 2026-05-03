#!/usr/bin/env python3
"""Structural validator for Jekyll blog posts.

Checks:
- YAML frontmatter present with layout, title, date
- No `<<[a-z]` doubled-prefix tag corruption
- Balanced opening/closing tags for common block elements
- Date in filename matches frontmatter date
- Slug not duplicated in _posts/ (unless validating that exact file)
- If <img src="/blog/images/X"> referenced, file exists

Usage: python scripts/validate_post.py <path-to-post.html> [--repo-root .]
Exit 0 on pass, 1 on fail. Prints JSON report to stdout.
"""
from __future__ import annotations

import json
import os
import re
import sys
from datetime import date
from pathlib import Path

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
DOUBLED_PREFIX_RE = re.compile(r"<<[a-z]")
IMG_SRC_RE = re.compile(r'<img[^>]+src="([^"]+)"', re.IGNORECASE)
FILENAME_DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})-([a-z0-9-]+)\.html$")

PAIRED_TAGS = ("p", "h1", "h2", "h3", "h4", "h5", "h6",
               "ol", "ul", "li", "a", "em", "strong", "code",
               "blockquote", "pre", "div", "span")


def parse_frontmatter(text: str) -> tuple[dict, str]:
    m = FRONTMATTER_RE.match(text)
    if not m:
        return {}, text
    block = m.group(1)
    body = text[m.end():]
    fm: dict = {}
    for line in block.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            fm[k.strip()] = v.strip().strip('"').strip("'")
    return fm, body


def check_balanced(body: str, tag: str) -> tuple[int, int]:
    opens = len(re.findall(rf"<{tag}(?=[\s>])", body, re.IGNORECASE))
    closes = len(re.findall(rf"</{tag}>", body, re.IGNORECASE))
    return opens, closes


def validate(path: Path, repo_root: Path) -> dict:
    errors: list[str] = []
    warnings: list[str] = []

    if not path.exists():
        return {"path": str(path), "ok": False, "errors": ["file does not exist"], "warnings": []}

    name = path.name
    m = FILENAME_DATE_RE.match(name)
    if not m:
        errors.append(f"filename '{name}' must match YYYY-MM-DD-slug.html")
        slug_from_name = None
        date_from_name = None
    else:
        y, mo, d, slug_from_name = m.groups()
        try:
            date_from_name = date(int(y), int(mo), int(d))
        except ValueError as e:
            errors.append(f"invalid date in filename: {e}")
            date_from_name = None

    text = path.read_text(encoding="utf-8")
    fm, body = parse_frontmatter(text)

    for required in ("title", "date"):
        if required not in fm:
            errors.append(f"frontmatter missing '{required}'")

    # `layout` is optional — _config.yml supplies `layout: post` via defaults.
    if fm.get("layout") and fm["layout"] != "post":
        warnings.append(f"frontmatter layout is '{fm['layout']}', expected 'post'")

    fm_date_str = fm.get("date", "")
    if fm_date_str and date_from_name:
        try:
            fm_date = date.fromisoformat(fm_date_str.split()[0])
            if fm_date != date_from_name:
                errors.append(f"frontmatter date {fm_date} != filename date {date_from_name}")
        except ValueError:
            errors.append(f"frontmatter date '{fm_date_str}' is not ISO format")

    doubled = DOUBLED_PREFIX_RE.findall(body)
    if doubled:
        errors.append(f"doubled-prefix tag corruption found: {len(doubled)} occurrence(s) of '<<[a-z]' in body")

    for tag in PAIRED_TAGS:
        opens, closes = check_balanced(body, tag)
        if opens != closes:
            errors.append(f"<{tag}> unbalanced: {opens} open vs {closes} close")

    posts_dir = repo_root / "_posts"
    if slug_from_name and posts_dir.exists():
        matches = [p for p in posts_dir.glob(f"*-{slug_from_name}.html") if p.resolve() != path.resolve()]
        if matches:
            errors.append(f"slug '{slug_from_name}' already used by {[str(p.name) for p in matches]}")

    for src in IMG_SRC_RE.findall(body):
        if src.startswith("/"):
            local = repo_root / src.lstrip("/")
            if not local.exists():
                errors.append(f"<img src=\"{src}\"> file not found at {local}")

    return {
        "path": str(path),
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "frontmatter": fm,
    }


def main() -> int:
    args = sys.argv[1:]
    repo_root = Path(".").resolve()
    paths: list[Path] = []
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--repo-root":
            repo_root = Path(args[i + 1]).resolve()
            i += 2
            continue
        paths.append(Path(a).resolve())
        i += 1

    if not paths:
        print("usage: validate_post.py <post.html> [<post.html> ...] [--repo-root PATH]", file=sys.stderr)
        return 2

    reports = [validate(p, repo_root) for p in paths]
    print(json.dumps(reports, indent=2))
    return 0 if all(r["ok"] for r in reports) else 1


if __name__ == "__main__":
    sys.exit(main())
