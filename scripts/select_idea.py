#!/usr/bin/env python3
import os
import re
import random
from datetime import datetime

# Paths
MANIFEST_PATH = os.path.expanduser("~/brain/post-warehouse/MANIFEST.md")
BRIEF_PATH = ".great-authors/daily-brief.md"
VOICE_LOG_PATH = ".great-authors/voice-rotation.json"

def get_idea_of_the_day():
    with open(MANIFEST_PATH, "r") as f:
        lines = f.readlines()

    # Extract table rows (skipping header and separator)
    ideas = []
    for line in lines:
        if "|" in line and "Status" not in line and "---" not in line:
            parts = [p.strip() for p in line.split("|")[1:-1]]
            if parts and parts[0] == "idea":
                ideas.append({
                    "slug": parts[1],
                    "title": parts[2],
                    "voices": [v.strip() for v in parts[3].split(",")] if parts[3] else [],
                    "date": parts[4]
                })

    if not ideas:
        return None

    # Selection logic: Random choice from 'idea' status
    # In a real scenario, this could be weighted by 'date added' or 'predecessor'
    return random.choice(ideas)

def get_target_persona(candidates):
    if not candidates:
        return "mcphee" # Default fallback

    # Try to avoid the last used persona from the log
    try:
        with open(VOICE_LOG_PATH, "r") as f:
            import json
            log = json.load(f)
            last_persona = log.get("last_persona")
    except:
        last_persona = None

    # Filter out last persona if possible
    available = [v for v in candidates if v != last_persona]
    if not available:
        available = candidates

    return random.choice(available)

def main():
    idea = get_idea_of_the_day()
    if not idea:
        print("No ideas found in the warehouse.")
        return

    persona = get_target_persona(idea["voices"])

    brief_content = f"""---
name: Daily Brief
date: {datetime.now().strftime('%Y-%m-%d')}
status: READY
---

# Idea of the Day: {idea['title']}
**Slug**: `{idea['slug']}`
**Target Persona**: {persona}

## Core Thesis
(The agent should now read `~/brain/post-warehouse/{idea['slug']}.md` to synthesize the core truth.)

## Key Talking Points
-

## Video Narrative Map
- **HeyGen Intro**:
- **Remotion Demo**:
- **HeyGen Outro**:

## Soul Guardrail
The content must reflect the intent of the Brain Vault and avoid persona-driven drift.
"""

    with open(BRIEF_PATH, "w") as f:
        f.write(brief_content)

    print(f"Brief created for {idea['title']} with persona {persona}.")

if __name__ == "__main__":
    main()
