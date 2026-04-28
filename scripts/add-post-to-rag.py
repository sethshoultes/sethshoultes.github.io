#!/usr/bin/env python3
"""
Add new blog posts to Seth's Clone (ElevenLabs Conversational AI) RAG knowledge base.

Detects posts in _posts/ that aren't yet attached to the agent, adds them as
URL documents with auto-sync, triggers RAG indexing for each, and PATCHes the
agent's knowledge_base list — preserving the existing entries.

Idempotent: running it twice with no new posts is a no-op.

Usage:
    python3 scripts/add-post-to-rag.py
        Auto-detect new posts and add them.

    python3 scripts/add-post-to-rag.py --dry-run
        Show what would be added; no API calls beyond the agent GET.

    python3 scripts/add-post-to-rag.py <slug>
        Force-add a specific post by slug (the bit between the date and .html).
        Useful if you renamed a title and need to add the new URL.

Caveat: identifies "already-attached" by matching the agent KB entry's `name`
field against the post title. If you rename a post's title, the script will
think it's a new post and add it — leaving the old entry orphaned. Cleanup the
old entry manually in the ElevenLabs dashboard if that happens.
"""
import argparse
import json
import os
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POSTS_DIR = ROOT / "_posts"

AGENT_ID = "jCFMMenhYBsub2QvAHal"
EMBEDDING_MODEL = "e5_mistral_7b_instruct"
SITE_BASE = "https://sethshoultes.com"

# ---- env ----
SECRETS = Path.home() / ".config/dev-secrets/secrets.env"
if not SECRETS.exists():
    sys.exit(f"missing canonical secrets at {SECRETS}")

for raw in SECRETS.read_text().splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

API_KEY = os.environ.get("ELEVENLABS_API_KEY")
if not API_KEY:
    sys.exit("ELEVENLABS_API_KEY missing from canonical secrets")


# ---- API helper ----
def call(method: str, path: str, body=None):
    url = f"https://api.elevenlabs.io{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "xi-api-key": API_KEY,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")
        sys.exit(f"\n{method} {path} → HTTP {e.code}\n{body_text}")


# ---- post discovery ----
def discover_posts():
    """Yield (slug, title, url) for every post in _posts/."""
    for p in sorted(POSTS_DIR.glob("*.html")):
        m = re.match(r"\d{4}-\d{2}-\d{2}-(.+)\.html$", p.name)
        if not m:
            continue
        slug = m.group(1)
        title_match = re.search(r'^title:\s*"([^"]+)"', p.read_text(), re.MULTILINE)
        title = title_match.group(1) if title_match else slug
        yield slug, title, f"{SITE_BASE}/blog/{slug}.html"


# ---- main ----
def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("slug", nargs="?", help="Force-add a specific slug (skips auto-detect).")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be added; no writes.")
    args = parser.parse_args()

    # 1. Pull current agent state.
    agent = call("GET", f"/v1/convai/agents/{AGENT_ID}")
    prompt_obj = agent["conversation_config"]["agent"]["prompt"]
    existing_kb = prompt_obj.get("knowledge_base", []) or []
    existing_names = {entry.get("name") for entry in existing_kb}
    print(f"agent already has {len(existing_kb)} KB entries.")

    # 2. Decide what to add.
    if args.slug:
        # Force-add a specific slug.
        match = next((p for p in discover_posts() if p[0] == args.slug), None)
        if not match:
            sys.exit(f"no post found with slug '{args.slug}' in {POSTS_DIR}")
        to_add = [match]
    else:
        # Auto-detect: posts whose title isn't already in the KB.
        to_add = [p for p in discover_posts() if p[1] not in existing_names]

    if not to_add:
        print("nothing to add. Up to date.")
        return

    print(f"\nposts to add ({len(to_add)}):")
    for slug, title, url in to_add:
        print(f"  • {title}")
        print(f"    {url}")

    if args.dry_run:
        print("\n(dry run — no changes made.)")
        return

    # 3. Create each KB doc + trigger indexing.
    new_entries = []
    print()
    for slug, title, url in to_add:
        print(f"  POST knowledge-base/url  {url}", flush=True)
        resp = call("POST", "/v1/convai/knowledge-base/url", {
            "url": url,
            "name": title,
            "enable_auto_sync": True,
        })
        doc_id = resp["id"]
        print(f"    id: {doc_id}")
        new_entries.append({
            "type": "url",
            "id": doc_id,
            "name": title,
            "usage_mode": "auto",
        })
        print(f"  index   {title}", flush=True)
        call("POST", f"/v1/convai/knowledge-base/{doc_id}/rag-index", {"model": EMBEDDING_MODEL})

    # 4. PATCH agent with combined KB list.
    # Preserve existing entries. PATCH on knowledge_base replaces the array.
    combined = list(existing_kb) + new_entries
    print(f"\nPATCH agent (knowledge_base: {len(existing_kb)} + {len(new_entries)} new = {len(combined)})...")
    call("PATCH", f"/v1/convai/agents/{AGENT_ID}", {
        "conversation_config": {
            "agent": {
                "prompt": {
                    "knowledge_base": combined,
                }
            }
        }
    })
    print("  done.")
    print("\nRAG indexing runs in the background; first call after this may not have the new docs ready yet.")


if __name__ == "__main__":
    main()
