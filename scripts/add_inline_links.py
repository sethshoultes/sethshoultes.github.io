#!/usr/bin/env python3
"""Add inline contextual links to an existing post based on data/references.md.

Pipeline:
  1. Read the post body and the reference catalog.
  2. Ask the API to identify natural-first-mention phrases that should link to
     specific catalog URLs. Returns a JSON list.
  3. Python applies each substitution mechanically: find first occurrence of
     `phrase` that is NOT already inside an <a> tag, wrap it in <a href=URL>.
     Skip if already linked or phrase not found.

Usage:
  scripts/add_inline_links.py <slug>
  scripts/add_inline_links.py <slug> --dry-run

Idempotent: phrases already inside <a> tags are skipped, so re-running does
not double-link.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from daily_blog import (  # type: ignore
    POSTS_DIR, REPO_ROOT, anthropic_client, ANTHROPIC_MODEL,
)

REFERENCES_FILE = REPO_ROOT / "data" / "references.md"


PROMPT_TEMPLATE = """You are adding inline contextual links to a blog post.

Below is the post body, followed by a CATALOG of canonical URLs the site links to.
Your job: identify phrases in the post body that are natural-first mentions of
catalog entries, and propose linking them.

Rules:
1. Only link the FIRST natural mention of each catalog entry. If a concept is
   mentioned three times in the post, the first instance gets the link.
2. Pick a phrase that reads naturally as link text — usually the noun phrase
   in prose (e.g. "the brain vault", "the public skeleton"), NOT the bare URL.
3. If the post mentions a concept that has a canonical resource in the catalog,
   propose the link — even if the mention is in passing. The point is to give
   the curious reader a doorway. Err on the side of linking, not abstaining.
   Skip ONLY if the phrase is too generic to read naturally as a link (e.g.
   the bare word "vault" — but "the brain vault" is fine).
4. Do not propose more than 4 links per post. Less is more.
5. The phrase must appear EXACTLY (case-sensitive, character-for-character) in
   the post body so a substring search can find it. Pick from prose actually
   present in the body — do not invent or paraphrase.
6. Skip phrases already inside <a> tags.

Output ONLY a JSON array, no commentary, no preamble, no explanation after. Each element is an object with:
  - "phrase": the exact substring from the post to wrap in <a>
  - "url": the catalog URL to link to
  - "rationale": one short sentence explaining why this link belongs here

If no links are warranted, output an empty array: []

POST BODY:

{body}

REFERENCE CATALOG:

{catalog}
"""


def load_catalog() -> str:
    if not REFERENCES_FILE.exists():
        raise RuntimeError(f"reference catalog not found at {REFERENCES_FILE}")
    return REFERENCES_FILE.read_text(encoding="utf-8")


def find_first_unlinked(text: str, phrase: str) -> int | None:
    """Return the index of the first occurrence of `phrase` that is NOT already
    inside an <a>...</a> tag. None if no such occurrence exists.
    """
    # Build a mask of which character positions are inside <a> tags.
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
    replacement = f'<a href="{url}">{phrase}</a>'
    return text[:idx] + replacement + text[end:], True


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug", help="filename slug of the post")
    ap.add_argument("--dry-run", action="store_true",
                    help="Print the model's proposals; don't modify the file.")
    args = ap.parse_args()

    matches = list(POSTS_DIR.glob(f"*-{args.slug}.html"))
    if not matches:
        print(f"no post found with slug '{args.slug}'", file=sys.stderr)
        return 1
    post_path = matches[0]
    post_text = post_path.read_text(encoding="utf-8")

    body_match = re.match(r"^---\s*\n.*?\n---\s*\n(.*)$", post_text, re.DOTALL)
    body = body_match.group(1) if body_match else post_text

    catalog = load_catalog()
    prompt = PROMPT_TEMPLATE.format(body=body[:8000], catalog=catalog)

    client = anthropic_client()
    msg = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=1500,
        messages=[{"role": "user", "content": prompt}],
    )
    response = msg.content[0].text.strip()
    # Strip code fences if present
    response = re.sub(r"^```(?:json)?\s*\n", "", response)
    response = re.sub(r"\n```\s*$", "", response)

    # Extract the first JSON array — the model sometimes appends commentary.
    array_match = re.search(r"\[.*?\](?=\s*(?:$|\n\S))", response, re.DOTALL)
    if not array_match:
        # Fall back to a greedy match if no clear delimiter
        array_match = re.search(r"\[.*\]", response, re.DOTALL)
    if not array_match:
        print(f"no JSON array found in model output:\n{response}", file=sys.stderr)
        return 1

    try:
        proposals = json.loads(array_match.group(0))
    except json.JSONDecodeError as e:
        print(f"could not parse JSON:\n{array_match.group(0)}\n\nerror: {e}", file=sys.stderr)
        return 1

    if not proposals:
        print("(no inline links proposed)")
        return 0

    print(f"Proposed {len(proposals)} inline link(s):")
    for p in proposals:
        print(f"  • '{p['phrase']}' → {p['url']}")
        if "rationale" in p:
            print(f"    {p['rationale']}")

    if args.dry_run:
        print("\n(dry run — no changes made)")
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
            print(f"  [skip] phrase not found or already linked: '{p['phrase']}'")

    if applied == 0:
        print("\nno changes made (nothing to apply)")
        return 0

    new_text = post_text[: body_match.start(1)] + new_body if body_match else new_body
    post_path.write_text(new_text, encoding="utf-8")
    print(f"\napplied {applied} link(s), skipped {skipped}: {post_path.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
