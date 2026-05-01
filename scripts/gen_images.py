#!/usr/bin/env python3
"""Generate blog featured images using OpenAI's gpt-image-1 API.

Reads a JSON manifest of images to generate and saves them to the blog images directory.
Each entry needs: slug, prompt, and optional style directives.

Authentication: reads OPENAI_API_KEY from environment.
"""

import json
import os
import sys
import base64
import argparse
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

DEFAULT_MODEL = "gpt-image-1"
DEFAULT_SIZE = "1024x1024"
DEFAULT_QUALITY = "high"
DEFAULT_OUTPUT_DIR = "/Users/sethshoultes/sethshoultes.github.io/blog/images"
API_URL = "https://api.openai.com/v1/images/generations"


def generate_image(prompt: str, output_path: str, model: str = DEFAULT_MODEL,
                   size: str = DEFAULT_SIZE, quality: str = DEFAULT_QUALITY) -> bool:
    """Generate a single image and save it."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Error: OPENAI_API_KEY not set", file=sys.stderr)
        return False

    payload = {
        "model": model,
        "prompt": prompt,
        "n": 1,
        "size": size,
        "quality": quality
    }

    req = Request(
        API_URL,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
    )

    try:
        with urlopen(req, timeout=300) as resp:
            data = json.loads(resp.read())
    except HTTPError as e:
        body = e.read().decode()
        print(f"HTTP {e.code}: {body}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"Request failed: {e}", file=sys.stderr)
        return False

    b64 = data.get("data", [{}])[0].get("b64_json")
    if not b64:
        print("No image data in response", file=sys.stderr)
        return False

    Path(output_path).write_bytes(base64.b64decode(b64))
    size_kb = Path(output_path).stat().st_size / 1024
    print(f"  -> {output_path} ({size_kb:.0f} KB)")
    return True


def main():
    parser = argparse.ArgumentParser(description="Generate blog featured images")
    parser.add_argument("--manifest", default="images.json",
                        help="JSON manifest of images to generate")
    parser.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR,
                        help="Directory to save images")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--size", default=DEFAULT_SIZE)
    parser.add_argument("--quality", default=DEFAULT_QUALITY)
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    if not manifest_path.exists():
        print(f"Manifest not found: {manifest_path}", file=sys.stderr)
        sys.exit(1)

    with open(manifest_path) as f:
        manifest = json.load(f)

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    ok = 0
    fail = 0
    for item in manifest:
        slug = item.get("slug")
        prompt = item.get("prompt")
        if not slug or not prompt:
            print(f"Skipping invalid entry: {item}", file=sys.stderr)
            fail += 1
            continue

        out_path = output_dir / f"{slug}-featured.png"
        print(f"Generating: {slug}")
        if generate_image(prompt, str(out_path), args.model, args.size, args.quality):
            ok += 1
        else:
            fail += 1

    print(f"\nDone. {ok} ok, {fail} failed.")
    sys.exit(0 if fail == 0 else 1)


if __name__ == "__main__":
    main()
