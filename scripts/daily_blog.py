#!/usr/bin/env python3
"""Daily blog orchestrator.

One-shot pipeline:
  1. Pick first ready idea from data/post-ideas.md, OR generate one from recent commits when empty.
  2. Pick voice (rotation: prefer voices not used in last len(voices)-1 days).
  3. Draft post via Anthropic API with voice persona as system prompt + brief + last 3 posts as tone reference.
  4. Generate industrial-minimalist image prompt and image via OpenAI DALL-E.
  5. Validate. On fail, write failure report and exit 1.
  6. On pass: stage, commit, push. Mark idea consumed. Update voice rotation.

ENV required:
  ANTHROPIC_API_KEY, OPENAI_API_KEY
ENV optional:
  REPO_ROOT (default: cwd)
  DRY_RUN=1 (write files but skip git commit/push)

Exit codes:
  0 success
  1 hard failure (validator failed, API failed, etc.)
  2 nothing-to-do (e.g., post already exists for today)
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

import anthropic
from openai import OpenAI
import requests

REPO_ROOT = Path(os.environ.get("REPO_ROOT", ".")).resolve()
POSTS_DIR = REPO_ROOT / "_posts"
IMAGES_DIR = REPO_ROOT / "blog" / "images"
DATA_DIR = REPO_ROOT / "data"
VOICES_DIR = REPO_ROOT / "scripts" / "voices"
IMAGES_JSON = REPO_ROOT / "images.json"
IDEAS_FILE = DATA_DIR / "post-ideas.md"
VOICES_FILE = DATA_DIR / "voices.json"
FAILURES_DIR = DATA_DIR / "failures"
VALIDATOR = REPO_ROOT / "scripts" / "validate_post.py"

DRY_RUN = os.environ.get("DRY_RUN") == "1"

ANTHROPIC_MODEL = "claude-opus-4-7"
IMAGE_MODEL = "dall-e-3"

# The fixed style suffix that gives every featured image the same pen-and-ink
# editorial illustration look — established in skills-as-sops, whats-on-the-desk,
# and the-recipe-that-wrote-itself. Only the conceptual subject varies per post.
IMAGE_STYLE_SUFFIX = (
    "Pen-and-ink editorial illustration, hand-drawn in the register of a vintage "
    "book illustration or a New Yorker spot drawing. Fine ink line work with "
    "crosshatched shading. Warm cream or sepia paper background, sometimes set "
    "within a softly crosshatched interior environment with a pool of warm light. "
    "Monochromatic palette — sepia ink, charcoal shadows, cream highlights. No "
    "saturated color. Literary, domestic, contemplative register. Single subject "
    "or small still-life, centered, simple composition. No humans, no text, no "
    "logos, no labels. The object carries the metaphor by itself."
)


# ----- idea selection -----------------------------------------------------------

IDEA_BLOCK_RE = re.compile(
    r"^##\s*Idea:\s*([a-z0-9-]+)\s*\n((?:[ \t]*\w+:\s*.*\n)+)",
    re.MULTILINE,
)


def parse_ideas(text: str) -> list[dict]:
    ideas = []
    for m in IDEA_BLOCK_RE.finditer(text):
        slug = m.group(1).strip()
        fields = {}
        for line in m.group(2).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                fields[k.strip()] = v.strip()
        fields["slug"] = slug
        fields["_match_start"] = m.start()
        fields["_match_end"] = m.end()
        ideas.append(fields)
    return ideas


def pick_ready_idea(text: str) -> dict | None:
    for idea in parse_ideas(text):
        if idea.get("status") == "ready":
            return idea
    return None


def mark_idea_consumed(text: str, slug: str) -> str:
    pattern = re.compile(
        rf"(##\s*Idea:\s*{re.escape(slug)}\s*\n(?:[ \t]*\w+:\s*.*\n)+)",
        re.MULTILINE,
    )

    def replace(m: re.Match) -> str:
        block = m.group(1)
        return re.sub(r"status:\s*ready", "status: consumed", block, count=1)

    return pattern.sub(replace, text, count=1)


# ----- voice rotation -----------------------------------------------------------

def pick_voice(voices_state: dict) -> str:
    voices = voices_state["voices"]
    history = voices_state.get("history", [])
    cooldown = max(1, len(voices) - 1)
    recent = {h["voice"] for h in history[-cooldown:]}
    candidates = [v for v in voices if v not in recent]
    if not candidates:
        candidates = voices
    return candidates[0]


def record_voice_use(voices_state: dict, voice: str, slug: str) -> dict:
    voices_state.setdefault("history", []).append({
        "voice": voice,
        "slug": slug,
        "date": date.today().isoformat(),
    })
    voices_state["history"] = voices_state["history"][-50:]
    return voices_state


# ----- anthropic / openai -------------------------------------------------------

def anthropic_client() -> anthropic.Anthropic:
    return anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])


def openai_client() -> OpenAI:
    return OpenAI(api_key=os.environ["OPENAI_API_KEY"])


def recent_posts_context(n: int = 3) -> str:
    posts = sorted(POSTS_DIR.glob("*.html"))[-n:]
    chunks = []
    for p in posts:
        text = p.read_text(encoding="utf-8")[:2500]
        chunks.append(f"--- {p.name} ---\n{text}")
    return "\n\n".join(chunks)


def recent_commits(n: int = 15) -> str:
    out = subprocess.run(
        ["git", "log", f"-n{n}", "--pretty=format:%h %s"],
        cwd=REPO_ROOT, capture_output=True, text=True,
    )
    return out.stdout.strip()


def generate_idea_from_repo() -> dict:
    """When the backlog is empty, ask the API to propose one based on recent commits."""
    client = anthropic_client()
    commits = recent_commits(20)
    msg = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=600,
        messages=[{
            "role": "user",
            "content": (
                "Recent commits on this blog repo:\n\n"
                f"{commits}\n\n"
                "Propose ONE blog post idea grounded in this work. The blog is about AI "
                "agentic workflows, orchestration, prompting, hooks, memory — the small "
                "disciplines of working with machines that almost-understand. The idea "
                "must be specific, observed, and load-bearing — not a survey or a 'tips' piece. "
                "Reply in this exact format and nothing else:\n\n"
                "slug: <kebab-case-slug>\n"
                "claim: <one-sentence thesis the post must defend>\n"
                "notes: <2-3 sentences of context the writer needs>"
            ),
        }],
    )
    text = msg.content[0].text.strip()
    fields = {}
    for line in text.splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            fields[k.strip()] = v.strip()
    if "slug" not in fields or "claim" not in fields:
        raise RuntimeError(f"idea generator returned malformed output:\n{text}")
    fields["status"] = "generated"
    return fields


def draft_post(idea: dict, voice: str, today: date) -> str:
    voice_path = VOICES_DIR / f"{voice}.md"
    if not voice_path.exists():
        raise RuntimeError(f"voice file not found: {voice_path}")
    system_prompt = voice_path.read_text(encoding="utf-8")

    tone_ref = recent_posts_context(3)

    user = (
        f"Today is {today.isoformat()}.\n\n"
        f"Slug: {idea['slug']}\n"
        f"Claim (the thesis the post must defend): {idea.get('claim', '')}\n"
        f"Notes: {idea.get('notes', '')}\n\n"
        "TONE REFERENCE — these are the three most recent posts on the blog. "
        "They establish the world the new post enters. Do not reference them by name "
        "unless your voice would naturally do so. They are here so you can match the "
        "register of the site.\n\n"
        f"{tone_ref}\n\n"
        "Write the post now. Output ONLY the complete file contents, starting with the "
        "Jekyll frontmatter (---) and ending with the last </p>. Use this exact frontmatter:\n\n"
        "---\n"
        f'title: "<your title>"\n'
        f'subtitle: "<one-sentence subtitle>"\n'
        f'date: {today.isoformat()}\n'
        "---\n\n"
        "Then a featured image tag in this exact form (the image will be generated to match):\n\n"
        f'<img src="/blog/images/{idea["slug"]}-featured.png" alt="<short alt text>" '
        'style="width:100%;max-width:780px;display:block;margin:0 auto 2rem;border-radius:6px" />\n\n'
        "Then your prose, every <p> opened and closed, every <h2> opened and closed.\n\n"
        "CRITICAL: Every opening tag is exactly <tagname>. Never write <<tagname or <<tt or any "
        "doubled-prefix variant. The validator blocks the commit if you do. Output the file. Nothing else."
    )

    client = anthropic_client()
    msg = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=4000,
        system=system_prompt,
        messages=[{"role": "user", "content": user}],
    )
    return msg.content[0].text.strip()


def generate_image_prompt(idea: dict, post_text: str) -> str:
    """Ask the API for a SUBJECT line; we append the fixed style suffix."""
    client = anthropic_client()
    msg = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=300,
        messages=[{
            "role": "user",
            "content": (
                "Read this blog post and propose a single physical-object SUBJECT for the "
                "featured image. The site's visual language is pen-and-ink editorial "
                "illustration — hand-drawn, crosshatched, sepia-on-cream, in the register of "
                "a vintage book illustration or a New Yorker spot drawing. The objects are "
                "domestic, writerly, craft-oriented: typewriters, desk lamps, notebooks, "
                "books, paper notes pinned to cork, hand tools, chess pieces, kitchen "
                "thermometers, gavels. Your job is ONLY to pick the metaphor object and "
                "describe its arrangement.\n\n"
                "Examples of past subjects (this site's actual house style):\n"
                "- 'A vintage typewriter on a desk with a sheet of paper rising out of it, "
                "the paper itself depicting a smaller typewriter — the recipe writing itself.'\n"
                "- 'A desk lamp casting a warm pool of light over an open notebook, with a "
                "few books and a chess piece scattered in the surrounding shadow.'\n"
                "- 'Two paper notes pinned to a softly crosshatched cork board, one bearing "
                "a checklist, one bearing a paragraph, each held by a single brass pushpin.'\n\n"
                f"Post claim: {idea.get('claim', '')}\n\n"
                f"Post text:\n\n{post_text[:3000]}\n\n"
                "Reply with ONE sentence describing the subject and arrangement. No preamble. "
                "No style words — those are added automatically."
            ),
        }],
    )
    subject = msg.content[0].text.strip().strip('"').strip("'")
    return f"{subject} {IMAGE_STYLE_SUFFIX}"


def generate_image(prompt: str, out_path: Path) -> None:
    client = openai_client()
    result = client.images.generate(
        model=IMAGE_MODEL,
        prompt=prompt,
        size="1792x1024",
        quality="hd",
        n=1,
    )
    url = result.data[0].url
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    out_path.write_bytes(r.content)


# ----- failure reporting --------------------------------------------------------

def report_failure(stage: str, summary: str, details: str = "") -> None:
    today_str = date.today().isoformat()
    FAILURES_DIR.mkdir(parents=True, exist_ok=True)
    failure_path = FAILURES_DIR / f"{today_str}.md"
    failure_path.write_text(
        f"# Daily blog failure — {today_str}\n\n"
        f"**Stage:** {stage}\n\n"
        f"**Summary:** {summary}\n\n"
        f"## Details\n\n```\n{details}\n```\n",
        encoding="utf-8",
    )

    # Open GitHub issue
    try:
        subprocess.run(
            ["gh", "issue", "create",
             "--title", f"Daily blog failed {today_str}: {summary[:60]}",
             "--body", failure_path.read_text(encoding="utf-8"),
             "--label", "daily-blog,automated"],
            cwd=REPO_ROOT, check=False, capture_output=True, text=True,
        )
    except Exception as e:
        print(f"[warn] could not open gh issue: {e}", file=sys.stderr)

    # Send Resend email
    resend_key = os.environ.get("RESEND_API_KEY")
    notify_to = os.environ.get("NOTIFY_EMAIL", "seth@caseproof.com")
    notify_from = os.environ.get("NOTIFY_FROM", "noreply@sethshoultes.com")
    if resend_key:
        try:
            requests.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {resend_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": notify_from,
                    "to": [notify_to],
                    "subject": f"Daily blog failed {today_str}",
                    "text": f"Stage: {stage}\n\nSummary: {summary}\n\nDetails:\n{details}",
                },
                timeout=15,
            )
        except Exception as e:
            print(f"[warn] could not send Resend email: {e}", file=sys.stderr)


# ----- main ---------------------------------------------------------------------

def main() -> int:
    force_date = os.environ.get("FORCE_DATE", "").strip()
    if force_date:
        today = date.fromisoformat(force_date)
        print(f"[info] FORCE_DATE={force_date} (overriding today)")
    else:
        today = date.today()

    # 0. Don't double-post
    existing_today = list(POSTS_DIR.glob(f"{today.isoformat()}-*.html"))
    if existing_today:
        print(f"[skip] post for {today} already exists: {existing_today[0].name}")
        return 2

    # 1. Pick idea
    ideas_text = IDEAS_FILE.read_text(encoding="utf-8") if IDEAS_FILE.exists() else ""
    idea = pick_ready_idea(ideas_text) if ideas_text else None
    idea_was_generated = False
    if idea is None:
        print("[info] no ready ideas, generating one from recent commits")
        try:
            idea = generate_idea_from_repo()
            idea_was_generated = True
        except Exception as e:
            report_failure("idea-generation", "Could not generate idea from commits", str(e))
            return 1

    slug = idea["slug"]
    print(f"[info] idea: {slug}")

    # Guard against slug collision
    if list(POSTS_DIR.glob(f"*-{slug}.html")):
        report_failure("slug-collision", f"Slug '{slug}' already used in _posts/", "")
        return 1

    # 2. Pick voice
    voices_state = json.loads(VOICES_FILE.read_text(encoding="utf-8"))
    voice = pick_voice(voices_state)
    print(f"[info] voice: {voice}")

    # 3. Draft post
    try:
        post_text = draft_post(idea, voice, today)
    except Exception as e:
        report_failure("draft", f"Anthropic API failed during draft", repr(e))
        return 1

    post_path = POSTS_DIR / f"{today.isoformat()}-{slug}.html"
    post_path.write_text(post_text, encoding="utf-8")
    print(f"[info] wrote {post_path.name}")

    # 4. Generate image prompt + image
    try:
        img_prompt = generate_image_prompt(idea, post_text)
    except Exception as e:
        report_failure("image-prompt", "Anthropic API failed during image prompt", repr(e))
        return 1
    print(f"[info] image prompt: {img_prompt[:120]}...")

    # The drafting model invented its own alt text based on what it imagined the
    # image would be. Replace it with one derived from the actual image subject so
    # alt and image agree. Subject is the first sentence of the prompt (before
    # IMAGE_STYLE_SUFFIX, which is suffix-appended verbatim).
    subject_alt = img_prompt
    if IMAGE_STYLE_SUFFIX in subject_alt:
        subject_alt = subject_alt.split(IMAGE_STYLE_SUFFIX, 1)[0].strip()
    # Strip trailing punctuation, escape quotes for HTML attribute
    subject_alt = subject_alt.rstrip(".").replace('"', "&quot;")
    new_post_text, n_subs = re.subn(
        rf'(<img[^>]+src="/blog/images/{re.escape(slug)}-featured\.png"[^>]*\salt=")[^"]*(")',
        rf'\g<1>{subject_alt}\g<2>',
        post_text,
        count=1,
    )
    if n_subs == 1:
        post_text = new_post_text
        post_path.write_text(post_text, encoding="utf-8")
        print("[info] alt text rewritten to match generated image")
    else:
        print("[warn] could not locate <img alt> for rewrite — leaving as drafted")

    image_path = IMAGES_DIR / f"{slug}-featured.png"
    try:
        generate_image(img_prompt, image_path)
    except Exception as e:
        report_failure("image-generate", "OpenAI image generation failed", repr(e))
        return 1
    print(f"[info] wrote {image_path.name}")

    # Update images.json
    try:
        images_arr = json.loads(IMAGES_JSON.read_text(encoding="utf-8")) if IMAGES_JSON.exists() else []
    except json.JSONDecodeError:
        images_arr = []
    if not any(item.get("slug") == slug for item in images_arr):
        images_arr.append({"slug": slug, "prompt": img_prompt})
        IMAGES_JSON.write_text(json.dumps(images_arr, indent=2) + "\n", encoding="utf-8")

    # 5. Validate
    res = subprocess.run(
        [sys.executable, str(VALIDATOR), str(post_path), "--repo-root", str(REPO_ROOT)],
        capture_output=True, text=True,
    )
    print(res.stdout)
    if res.returncode != 0:
        report_failure("validate", "Validator rejected the draft", res.stdout + "\n" + res.stderr)
        return 1

    # Update post-ideas.md (if we used a backlog idea)
    if not idea_was_generated and ideas_text:
        new_text = mark_idea_consumed(ideas_text, slug)
        IDEAS_FILE.write_text(new_text, encoding="utf-8")

    # Update voice rotation
    voices_state = record_voice_use(voices_state, voice, slug)
    VOICES_FILE.write_text(json.dumps(voices_state, indent=2) + "\n", encoding="utf-8")

    # 6. Commit + push
    if DRY_RUN:
        print("[dry-run] skipping git commit/push")
        return 0

    title = ""
    fm_match = re.search(r'^title:\s*"([^"]+)"', post_text, re.MULTILINE)
    if fm_match:
        title = fm_match.group(1)
    commit_msg = f"Publish '{title or slug}'\n\nVoice: {voice}\nIdea: {idea.get('claim', '')[:120]}\n"

    paths = [str(post_path), str(image_path), str(IMAGES_JSON), str(VOICES_FILE)]
    if not idea_was_generated:
        paths.append(str(IDEAS_FILE))

    subprocess.run(["git", "add"] + paths, cwd=REPO_ROOT, check=True)

    git_user = os.environ.get("GIT_AUTHOR_NAME", "daily-blog-bot")
    git_email = os.environ.get("GIT_AUTHOR_EMAIL", "bot@users.noreply.github.com")
    env = {**os.environ,
           "GIT_AUTHOR_NAME": git_user, "GIT_AUTHOR_EMAIL": git_email,
           "GIT_COMMITTER_NAME": git_user, "GIT_COMMITTER_EMAIL": git_email}
    subprocess.run(["git", "commit", "-m", commit_msg], cwd=REPO_ROOT, check=True, env=env)
    subprocess.run(["git", "push"], cwd=REPO_ROOT, check=True, env=env)

    print(f"[done] published {post_path.name} in voice {voice}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        report_failure("uncaught", f"{type(e).__name__}: {e}", repr(e))
        raise
