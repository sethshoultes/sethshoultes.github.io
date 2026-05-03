#!/usr/bin/env python3
"""Retrofit `related:` frontmatter and a closing post-bio block onto an existing post.

Reads an existing post, asks the API to propose:
  - 2-3 `related:` entries (slug + note) drawn from the actual corpus
  - A closing block in Register A (literary aside) or Register B (author bio)

Then injects both into the post file: `related:` before the closing `---` of
frontmatter, the closing block before the final newline of the body.

Usage:
  scripts/add_post_closer.py <slug> [--register A|B]

Idempotent: if the post already has `related:` in frontmatter or a `<p class="post-bio">`
in the body, those parts are left alone.
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from daily_blog import (  # type: ignore
    POSTS_DIR, anthropic_client, corpus_index, ANTHROPIC_MODEL, _post_meta,
)


CLOSER_PROMPT = """You are adding a closing flourish to an existing blog post.

Read the post body below. Then output TWO things, in this exact format with these exact section headers:

=== RELATED ===
- slug: <slug-from-available-list>
  note: <one-line description of the connection — what this related post adds, contrasts with, or proves>
- slug: <slug-from-available-list>
  note: <one-line description>
- slug: <slug-from-available-list>
  note: <one-line description>

=== CLOSER ===
<one or two sentences>

The CLOSER is a {register_directive}.

Examples of Register A (literary aside about a writer or thinker):
- "Kurt Vonnegut wrote 14 novels and died before anyone told him the job was now to brief the machine. He would have found this funny and then noticed it wasn't."
- "Orwell warned about words that do the thinking for us. The validator does no thinking. That is the whole point."

Examples of Register B (author bio):
- "Seth Shoultes builds at <a href=\"https://garagedoorscience.com\">garagedoorscience.com</a> and writes here when the building produces something worth saying."

The CLOSER must be ONE register only, never both. Output ONLY the two sections; no preamble, no commentary.

AVAILABLE POSTS for related-reading (use slugs exactly as shown):

{corpus}

POST TITLE: {title}
POST SUBTITLE: {subtitle}

POST BODY:

{body}
"""


REGISTER_A = (
    "Register A: a brief literary aside about a writer or thinker whose work bears on the post's argument. "
    "One or two sentences. The figure should be real, and the observation should land specifically — not "
    "a generic name-drop. Avoid clichés. Match the post's voice."
)

REGISTER_B = (
    "Register B: a short author bio. Use this template, possibly with a small flourish that connects to "
    'the post: "Seth Shoultes builds at <a href=\\"https://garagedoorscience.com\\">garagedoorscience.com</a> '
    'and writes here when the building produces something worth saying."'
)


def parse_response(text: str) -> tuple[list[dict], str]:
    related_match = re.search(r"=== RELATED ===\s*\n(.*?)(?=\n=== CLOSER ===)", text, re.DOTALL)
    closer_match = re.search(r"=== CLOSER ===\s*\n(.*?)$", text, re.DOTALL)
    if not related_match or not closer_match:
        raise RuntimeError(f"could not parse model response:\n{text}")

    related: list[dict] = []
    block = related_match.group(1).strip()
    cur: dict | None = None
    for line in block.splitlines():
        s = line.strip()
        if s.startswith("- slug:"):
            if cur:
                related.append(cur)
            cur = {"slug": s.split(":", 1)[1].strip().strip('"').strip("'")}
        elif s.startswith("note:") and cur is not None:
            cur["note"] = s.split(":", 1)[1].strip().strip('"').strip("'")
    if cur:
        related.append(cur)

    closer = closer_match.group(1).strip()
    return related, closer


def inject_related(post_text: str, related: list[dict]) -> str:
    """Insert `related:` into frontmatter (before the closing `---`)."""
    fm_match = re.match(r"^---\s*\n(.*?)\n---\s*\n", post_text, re.DOTALL)
    if not fm_match:
        raise RuntimeError("no frontmatter found in post")
    fm = fm_match.group(1)
    if re.search(r"^related:\s*$", fm, re.MULTILINE):
        print("[skip] post already has `related:` in frontmatter")
        return post_text
    related_block = "related:\n"
    for r in related:
        note = r["note"].replace('"', '\\"')
        related_block += f'  - slug: {r["slug"]}\n    note: "{note}"\n'
    new_fm = fm.rstrip() + "\n" + related_block.rstrip()
    return f"---\n{new_fm}\n---\n" + post_text[fm_match.end():]


def inject_closer(post_text: str, closer: str) -> str:
    """Append `<hr>\\n\\n<p class="post-bio">...</p>\\n` at the end of the body."""
    if 'class="post-bio"' in post_text:
        print('[skip] post already has <p class="post-bio">')
        return post_text
    body = post_text.rstrip()
    closer_html = f'\n\n<hr>\n\n<p class="post-bio"><em>{closer.strip()}</em></p>\n'
    return body + closer_html


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug", help="filename slug of the post (the bit between date and .html)")
    ap.add_argument("--register", choices=["A", "B"], default=None,
                    help="Force Register A (literary aside) or B (bio). Default: model picks.")
    args = ap.parse_args()

    matches = list(POSTS_DIR.glob(f"*-{args.slug}.html"))
    if not matches:
        print(f"no post found with slug '{args.slug}'", file=sys.stderr)
        return 1
    post_path = matches[0]
    post_text = post_path.read_text(encoding="utf-8")
    meta = _post_meta(post_path) or {"title": args.slug, "subtitle": ""}

    body_match = re.match(r"^---\s*\n.*?\n---\s*\n(.*)$", post_text, re.DOTALL)
    body = body_match.group(1) if body_match else post_text

    if args.register == "A":
        register = REGISTER_A
    elif args.register == "B":
        register = REGISTER_B
    else:
        register = (
            "EITHER Register A (literary aside about a writer or thinker whose work bears on this post) "
            "OR Register B (author bio) — pick whichever fits the post better. Use only one register."
        )

    prompt = CLOSER_PROMPT.format(
        register_directive=register,
        corpus=corpus_index(25),
        title=meta["title"],
        subtitle=meta["subtitle"],
        body=body[:6000],
    )

    client = anthropic_client()
    msg = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=800,
        messages=[{"role": "user", "content": prompt}],
    )
    response = msg.content[0].text

    related, closer = parse_response(response)
    print("RELATED:")
    for r in related:
        print(f"  - {r['slug']}: {r.get('note', '')}")
    print(f"\nCLOSER: {closer}\n")

    new_text = inject_related(post_text, related)
    new_text = inject_closer(new_text, closer)

    if new_text == post_text:
        print("[no-op] nothing to add (post already has related and post-bio)")
        return 0

    post_path.write_text(new_text, encoding="utf-8")
    print(f"updated {post_path.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
