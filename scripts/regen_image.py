#!/usr/bin/env python3
"""Regenerate the featured image for an existing post in the current locked style.

Usage:
  scripts/regen_image.py <slug>

Reads the post body to derive a fresh subject line, generates a new image with
the current IMAGE_STYLE_SUFFIX, overwrites blog/images/<slug>-featured.png,
updates the images.json entry, and rewrites the <img alt=> in the post.

Useful when the house style changes and old posts need to catch up.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

# Reuse orchestrator pieces directly so style stays in one place.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from daily_blog import (  # type: ignore
    REPO_ROOT, POSTS_DIR, IMAGES_DIR, IMAGES_JSON, IMAGE_STYLE_SUFFIX,
    generate_image_prompt, generate_image,
)


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: regen_image.py <slug>", file=sys.stderr)
        return 2
    slug = sys.argv[1]

    matches = list(POSTS_DIR.glob(f"*-{slug}.html"))
    if not matches:
        print(f"no post found with slug '{slug}'", file=sys.stderr)
        return 1
    post_path = matches[0]
    post_text = post_path.read_text(encoding="utf-8")

    # Best-effort idea claim from frontmatter subtitle
    sub_match = re.search(r'^subtitle:\s*"([^"]+)"', post_text, re.MULTILINE)
    title_match = re.search(r'^title:\s*"([^"]+)"', post_text, re.MULTILINE)
    idea = {
        "slug": slug,
        "claim": sub_match.group(1) if sub_match else (title_match.group(1) if title_match else slug),
    }

    img_prompt = generate_image_prompt(idea, post_text)
    print(f"new prompt: {img_prompt[:160]}...")

    image_path = IMAGES_DIR / f"{slug}-featured.png"
    generate_image(img_prompt, image_path)
    print(f"wrote {image_path}")

    # Update images.json
    arr = json.loads(IMAGES_JSON.read_text(encoding="utf-8")) if IMAGES_JSON.exists() else []
    found = False
    for item in arr:
        if item.get("slug") == slug:
            item["prompt"] = img_prompt
            found = True
            break
    if not found:
        arr.append({"slug": slug, "prompt": img_prompt})
    IMAGES_JSON.write_text(json.dumps(arr, indent=2) + "\n", encoding="utf-8")

    # Rewrite alt text in the post
    subject_alt = img_prompt
    if IMAGE_STYLE_SUFFIX in subject_alt:
        subject_alt = subject_alt.split(IMAGE_STYLE_SUFFIX, 1)[0].strip()
    subject_alt = subject_alt.rstrip(".").replace('"', "&quot;")

    new_post_text, n = re.subn(
        rf'(<img[^>]+src="/blog/images/{re.escape(slug)}-featured\.png"[^>]*\salt=")[^"]*(")',
        rf'\g<1>{subject_alt}\g<2>',
        post_text,
        count=1,
    )
    if n == 1:
        post_path.write_text(new_post_text, encoding="utf-8")
        print(f"alt text updated in {post_path.name}")
    else:
        print("[warn] could not find <img alt> to rewrite")

    return 0


if __name__ == "__main__":
    sys.exit(main())
