#!/usr/bin/env python3
"""Add inline contextual links to a post.

Pulls a comprehensive catalog at runtime from THREE sources:
  1. data/references.md — curated entries (recipes, repos, learnings, runbooks).
  2. _posts/ — every other post on this site, as a link target.
  3. recipes/ — every recipe page on this site.

Asks the API to identify phrases that should link to catalog entries. Returns
JSON. Python applies substitutions mechanically: first occurrence not already
inside an <a> tag gets wrapped.

DEFAULT BEHAVIOR IS TO LINK. Missing a link is worse than over-linking. The
prompt instructs the model to err aggressively on the side of linking.

Usage:
  scripts/add_inline_links.py <slug>
  scripts/add_inline_links.py <slug> --dry-run

Idempotent: phrases already inside <a> tags are skipped.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from daily_blog import (  # type: ignore
    POSTS_DIR, REPO_ROOT, anthropic_client, ANTHROPIC_MODEL, _post_meta,
)

REFERENCES_FILE = REPO_ROOT / "data" / "references.md"
RECIPES_DIR = REPO_ROOT / "recipes"
SITE_BASE = "https://sethshoultes.com"


def build_full_catalog(exclude_slug: str | None = None) -> str:
    """Build the complete link-target catalog from all sources."""
    parts = []

    # 1. Curated catalog (recipes, repos, learnings, runbooks, external)
    if REFERENCES_FILE.exists():
        parts.append("# Curated Catalog\n")
        parts.append(REFERENCES_FILE.read_text(encoding="utf-8"))

    # 2. All blog posts on this site as link targets
    parts.append("\n\n# All Blog Posts (link to any of these by their slug)\n")
    posts = sorted(POSTS_DIR.glob("*.html"))
    for p in posts:
        meta = _post_meta(p)
        if not meta or meta["slug"] == exclude_slug:
            continue
        # The Jekyll URL is /blog/<frontmatter-slug>.html (or filename slug if no override)
        url_slug = meta["slug"]
        # Check for frontmatter slug override
        text = p.read_text(encoding="utf-8")
        slug_match = re.search(r'^slug:\s*"?([^"\n]+?)"?\s*$', text, re.MULTILINE)
        if slug_match:
            url_slug = slug_match.group(1).strip()
        url = f"/blog/{url_slug}.html"
        title = meta["title"]
        sub = meta["subtitle"][:120] if meta["subtitle"] else ""
        parts.append(f'## Post: "{title}"\n')
        parts.append(f"url: {url}\n")
        parts.append(f"triggers: {title}, {meta['slug']}\n")
        if sub:
            parts.append(f"description: {sub}\n")
        parts.append("\n")

    # 3. All recipes on this site
    if RECIPES_DIR.exists():
        parts.append("\n# All Recipes (link by recipe name)\n")
        for r in sorted(RECIPES_DIR.glob("*.html")):
            if r.name == "index.html":
                continue
            text = r.read_text(encoding="utf-8")
            t_match = re.search(r"<title>([^<]+)</title>", text)
            title = t_match.group(1).strip() if t_match else r.stem
            url = f"/recipes/{r.name}"
            parts.append(f'## Recipe: "{title}"\n')
            parts.append(f"url: {url}\n")
            parts.append(f"triggers: {title}, the {r.stem.replace('-', ' ')} recipe\n\n")

    return "".join(parts)


PROMPT_TEMPLATE = """You are adding inline contextual links to a blog post.

You have been failing at this. Recent posts have shipped with mentions of
public repos, sister blog posts, and canonical recipes — none of them linked.
The operator has had to ask repeatedly. This is the moment to fix it.

THE DEFAULT IS TO LINK. If a phrase in the post body matches a catalog entry,
link the first natural occurrence. Abstain only if the phrase is genuinely
too generic to read naturally as link text. Missing a link is a worse
failure than over-linking. The phrase "no inline links proposed" is almost
always the wrong answer for a post that mentions any concrete project,
repo, or sister post.

Rules:
1. Link the FIRST natural mention of each catalog entry. If a concept appears
   three times, the first instance gets the link.
2. The link text should be a noun phrase from the prose ("the brain vault",
   "the public skeleton", "the great-authors plugin"), not the bare URL.
3. The phrase must appear EXACTLY (character-for-character) in the post body.
4. Skip phrases already inside <a> tags.
5. AGGRESSIVELY scan for: post titles, sister-post slugs, repo names
   (great-*-plugin, building-with-ai-*, dash-command-bar, etc.), recipe
   names, brain learning names, garagedoorscience.com pages.
6. If the post mentions another post by title — even casually — LINK IT.
7. If the post names a public GitHub repo or org — LINK IT.
8. If the post names a brain learning or runbook — LINK IT.
9. If the post says "the brain vault recipe" or "the canonical secrets recipe"
   or any recipe by name — LINK IT.
10. Up to 12 links per post. More is fine if the references are real.
11. Do NOT invent phrases not in the post.

Output ONLY a JSON array, no commentary, no preamble, no explanation.

Each element:
{{"phrase": "<exact substring from post>", "url": "<catalog url>", "rationale": "<one short sentence>"}}

If no links are warranted (only because the post truly has no linkable
references — rare), output [].

POST BODY:

{body}

LINK CATALOG (link to any of these — recipes, posts, repos, learnings,
runbooks, external sites):

{catalog}
"""


def find_first_unlinked(text: str, phrase: str) -> int | None:
    inside = bytearray(len(text))
    for m in re.finditer(r"<a\b[^>]*>.*?</a>", text, re.DOTALL | re.IGNORECASE):
        for i in range(m.start(), m.end()):
            inside[i] = 1
    start = 0
    while True:
        idx = text.find(phrase, start)
        if idx == -1:
            return None
        end = idx + len(phrase)
        if not any(inside[i] for i in range(idx, end)):
            return idx
        start = idx + 1


def apply_link(text: str, phrase: str, url: str) -> tuple[str, bool]:
    idx = find_first_unlinked(text, phrase)
    if idx is None:
        return text, False
    end = idx + len(phrase)
    return text[:idx] + f'<a href="{url}">{phrase}</a>' + text[end:], True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    matches = list(POSTS_DIR.glob(f"*-{args.slug}.html"))
    if not matches:
        print(f"no post found with slug '{args.slug}'", file=sys.stderr)
        return 1
    post_path = matches[0]
    post_text = post_path.read_text(encoding="utf-8")

    body_match = re.match(r"^---\s*\n.*?\n---\s*\n(.*)$", post_text, re.DOTALL)
    body = body_match.group(1) if body_match else post_text

    catalog = build_full_catalog(exclude_slug=args.slug)
    prompt = PROMPT_TEMPLATE.format(body=body[:10000], catalog=catalog)

    client = anthropic_client()
    msg = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=2500,
        messages=[{"role": "user", "content": prompt}],
    )
    response = msg.content[0].text.strip()
    response = re.sub(r"^```(?:json)?\s*\n", "", response)
    response = re.sub(r"\n```\s*$", "", response)

    array_match = re.search(r"\[.*?\](?=\s*(?:$|\n\S))", response, re.DOTALL)
    if not array_match:
        array_match = re.search(r"\[.*\]", response, re.DOTALL)
    if not array_match:
        print(f"no JSON array found:\n{response}", file=sys.stderr)
        return 1

    try:
        proposals = json.loads(array_match.group(0))
    except json.JSONDecodeError as e:
        print(f"could not parse JSON:\n{array_match.group(0)}\n\nerror: {e}", file=sys.stderr)
        return 1

    if not proposals:
        print(f"  (no inline links proposed for {args.slug})")
        return 0

    print(f"  {len(proposals)} link(s) proposed for {args.slug}:")
    for p in proposals:
        print(f"    • '{p['phrase']}' → {p['url']}")

    if args.dry_run:
        return 0

    new_body = body
    applied = 0
    skipped = 0
    for p in proposals:
        new_body, ok = apply_link(new_body, p["phrase"], p["url"])
        if ok:
            applied += 1
        else:
            skipped += 1
            print(f"    [skip] phrase not found or already linked: '{p['phrase']}'")

    if applied == 0:
        print(f"  (nothing to apply — all phrases missing or already linked)")
        return 0

    new_text = post_text[: body_match.start(1)] + new_body if body_match else new_body
    post_path.write_text(new_text, encoding="utf-8")
    print(f"  → applied {applied}, skipped {skipped}: {post_path.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
