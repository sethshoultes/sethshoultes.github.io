#!/usr/bin/env python3
import os
import json
from datetime import datetime

# Path to the voice rotation log
VOICE_LOG_PATH = os.path.expanduser("~/.claude/projects/-Users-sethshoultes-sethshoultes-github-io/memory/.great-authors/voice-rotation.json")
# Fallback path for the current working directory
CWD_VOICE_LOG_PATH = ".great-authors/voice-rotation.json"

def update_voice_log(persona, slug):
    # Try CWD path first, then memory path
    target_path = CWD_VOICE_LOG_PATH if os.path.exists(CWD_VOICE_LOG_PATH) else VOICE_LOG_PATH

    try:
        with open(target_path, "r") as f:
            log = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        log = {"last_persona": None, "rotation_history": [], "current_streak": 0}

    # Update last persona
    old_persona = log.get("last_persona")
    log["last_persona"] = persona

    # Update streak
    if old_persona == persona:
        log["current_streak"] = log.get("current_streak", 0) + 1
    else:
        log["current_streak"] = 1

    # Add to history
    log["rotation_history"].append({
        "date": datetime.now().strftime('%Y-%m-%d'),
        "persona": persona,
        "slug": slug
    })

    # Keep history manageable (last 100 entries)
    log["rotation_history"] = log["rotation_history"][-100:]

    with open(target_path, "w") as f:
        json.dump(log, f, indent=2)

if __name__ == "__main__":
    import sys
    if len(sys.argv) < 3:
        print("Usage: update_voice.py <persona> <slug>")
        sys.exit(1)

    update_voice_log(sys.argv[1], sys.argv[2])
    print(f"Voice log updated: {sys.argv[1]} for {sys.argv[2]}")
