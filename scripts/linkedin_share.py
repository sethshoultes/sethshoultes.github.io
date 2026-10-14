#!/usr/bin/env python3
"""Share each new sethshoultes.com post on Seth's own LinkedIn (sethshoultes.github.io#70).

Reads the token that caseproofagent/memberpress-ai-cast#151's scheduler also posts with:
LINKEDIN_ACCESS_TOKEN, LINKEDIN_PERSON_URN (urn:li:person:<id>), LINKEDIN_TOKEN_EXPIRES_AT
in ~/.config/dev-secrets/seth-linkedin/secrets.env. This script never writes that file —
#151 signs Seth in and renews the token; this only reads it.

Scans _posts/*.html for the oldest post not yet in data/li-shared.log and posts it. Dry
run unless --live. Meant to run locally on Seth's Mac (a launchd job, see
ops/li-share-run.sh) once a day at 09:30 MDT, kept >=1h clear of #151's 07:15/11:30/15:45
MDT slots, since the secrets file lives on this Mac and no GitHub Actions runner can read it.

With 61 posts already published and no log yet, a first live run would otherwise try to
backfill the entire archive one per day. --seed marks everything except the N most recent
posts (default 3) as already shared, so the daily run only ever touches real new posts plus
a short, spaced backfill of the last few. Run --seed once, by hand, before the cron goes live.

    python3 scripts/linkedin_share.py --seed [--keep 3]   # one-time: mark old posts shared
    python3 scripts/linkedin_share.py              # dry run
    python3 scripts/linkedin_share.py --live        # actually post the next unshared entry
    python3 scripts/linkedin_share.py --check-expiry   # exit 4 if the token expires within 7 days
"""
import argparse
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SECRETS = Path.home() / ".config/dev-secrets/seth-linkedin/secrets.env"
POSTS_DIR = ROOT / "_posts"
LOG = ROOT / "data" / "li-shared.log"
SITE_URL = "https://sethshoultes.com"
API_VERSION = "202609"
REMIND_DAYS = 7

FRONT_MATTER_RE = re.compile(r"^---\n(.*?)\n---\n", re.DOTALL)
POST_NAME_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})-(.+)\.html$")


def read_secrets(path=SECRETS):
    if not path.exists():
        print(
            f"{path} is missing. memberpress-ai-cast#151 creates it after Seth's one sign-in.",
            file=sys.stderr,
        )
        sys.exit(2)
    env = {}
    for line in path.read_text().splitlines():
        m = re.match(r"^([A-Z_]+)=(.*)$", line)
        if m:
            env[m.group(1)] = m.group(2).strip().strip("'\"")
    return env


def days_left(expires_at, now=None):
    now = now or datetime.now(timezone.utc)
    try:
        dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return float("nan")
    return (dt - now).days


def front_matter(text):
    m = FRONT_MATTER_RE.match(text)
    if not m:
        return {}
    fm = {}
    for line in m.group(1).splitlines():
        kv = re.match(r"^(\w+):\s*(.+)$", line)
        if kv:
            fm[kv.group(1)] = kv.group(2).strip().strip("'\"")
    return fm


def strip_tags(text):
    return re.sub(r"<[^>]+>", "", text)


def posts_by_slug():
    posts = {}
    for f in POSTS_DIR.glob("*.html"):
        m = POST_NAME_RE.match(f.name)
        if not m:
            continue
        date, slug = m.groups()
        fm = front_matter(f.read_text())
        posts[slug] = {
            "slug": slug,
            "date": date,
            "title": fm.get("title", slug),
            "subtitle": strip_tags(fm["subtitle"]) if fm.get("subtitle") else None,
        }
    return posts


def shared_slugs(log=LOG):
    if not log.exists():
        return set()
    return {
        line.split("\t")[2]
        for line in log.read_text().splitlines()
        if line.strip()
    }


def pick_next(posts, shared):
    """Oldest unshared post first, so a backfill doesn't skip straight to today's."""
    candidates = sorted(
        (p for slug, p in posts.items() if slug not in shared),
        key=lambda p: p["date"],
    )
    return candidates[0] if candidates else None


# LinkedIn's "little text": an unescaped reserved character cuts the post off there or gets
# it refused. Matches caseproofagent/memberpress-ai-cast's scripts/linkedin-post.mjs.
def escape_little_text(text):
    return re.sub(r"([\\|{}@\[\]()<>#*_~])", r"\\\1", text)


def utm(url, slug):
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}utm_source=linkedin&utm_medium=social&utm_campaign=seth_linkedin&utm_content={slug}"


def build_request(post, author_urn):
    url = utm(f"{SITE_URL}/blog/{post['slug']}", post["slug"])
    # The subtitle is already written in Seth's own voice by the post pipeline
    # (scripts/voices/seth.md); falls back to the title alone for older posts that
    # predate that convention.
    text = f"{post['title']}\n\n{post['subtitle']}" if post.get("subtitle") else post["title"]
    body = {
        "author": author_urn,
        "commentary": escape_little_text(text),
        "visibility": "PUBLIC",
        "distribution": {
            "feedDistribution": "MAIN_FEED",
            "targetEntities": [],
            "thirdPartyDistributionChannels": [],
        },
        "lifecycleState": "PUBLISHED",
        "isReshareDisabledByAuthor": False,
        "content": {"article": {"source": url, "title": post["title"]}},
    }
    return {"endpoint": "https://api.linkedin.com/rest/posts", "body": body}


def send(req, token):
    data = json.dumps(req["body"]).encode()
    r = urllib.request.Request(
        req["endpoint"],
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "LinkedIn-Version": API_VERSION,
            "X-Restli-Protocol-Version": "2.0.0",
        },
    )
    try:
        with urllib.request.urlopen(r) as resp:
            if resp.status != 201:
                raise SystemExit(f"Post failed: HTTP {resp.status} {resp.read()}")
            return resp.headers.get("x-restli-id")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"Post failed: HTTP {e.code} {e.read().decode(errors='replace')}")


def seed(keep=3, log=LOG):
    """Mark every post except the `keep` most recent as already shared, so a first live
    run doesn't try to post the entire archive. Idempotent: re-running after some posts
    are already logged only seeds the ones still missing."""
    posts = sorted(posts_by_slug().values(), key=lambda p: p["date"])
    already = shared_slugs(log)
    to_seed = posts[: max(0, len(posts) - keep)]
    log.parent.mkdir(parents=True, exist_ok=True)
    seeded = 0
    with log.open("a") as f:
        for p in to_seed:
            if p["slug"] in already:
                continue
            f.write(f"{datetime.now(timezone.utc).isoformat()}\tseed\t{p['slug']}\n")
            seeded += 1
    kept = [p["slug"] for p in posts[max(0, len(posts) - keep):]]
    print(f"Seeded {seeded} pre-existing post(s) as already shared. Left live for backfill: {kept}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true")
    ap.add_argument("--check-expiry", action="store_true")
    ap.add_argument("--seed", action="store_true", help="One-time: mark old posts already shared")
    ap.add_argument("--keep", type=int, default=3, help="With --seed: how many recent posts to leave live")
    args = ap.parse_args()

    if args.seed:
        seed(keep=args.keep)
        return

    if args.check_expiry:
        env = read_secrets()
        left = days_left(env.get("LINKEDIN_TOKEN_EXPIRES_AT", ""))
        print(f"Seth's LinkedIn token (shared with cast#151): {left} days left.")
        if left != left or left <= REMIND_DAYS:  # NaN check
            sys.exit(4)
        return

    next_post = pick_next(posts_by_slug(), shared_slugs())
    if not next_post:
        print("No unshared post found in _posts/.")
        return

    if not args.live:
        req = build_request(next_post, "{LINKEDIN_PERSON_URN}")
        print("--- dry run, nothing posted (add --live to post) ---")
        print(json.dumps(req["body"], indent=2))
        print(f"--- {SECRETS} {'is present' if SECRETS.exists() else 'is missing: a --live post would fail'} ---")
        return

    env = read_secrets()
    if not env.get("LINKEDIN_ACCESS_TOKEN") or not env.get("LINKEDIN_PERSON_URN"):
        raise SystemExit(
            f"LINKEDIN_ACCESS_TOKEN and LINKEDIN_PERSON_URN aren't in {SECRETS} "
            "(memberpress-ai-cast#151 sets them)."
        )
    if days_left(env.get("LINKEDIN_TOKEN_EXPIRES_AT", "")) < 0:
        raise SystemExit("Seth's LinkedIn token has expired (memberpress-ai-cast#151 renews it).")

    post_id = send(build_request(next_post, env["LINKEDIN_PERSON_URN"]), env["LINKEDIN_ACCESS_TOKEN"])
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a") as f:
        f.write(f"{datetime.now(timezone.utc).isoformat()}\t{post_id}\t{next_post['slug']}\n")
    print(f"Shared: https://www.linkedin.com/feed/update/{post_id}/")


if __name__ == "__main__":
    main()
