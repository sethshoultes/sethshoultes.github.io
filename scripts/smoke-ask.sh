#!/usr/bin/env bash
# Smoke test for the live Ask Seth's AI endpoint: one real question must come back as JSON
# with an "answer". Run after a deploy:  scripts/smoke-ask.sh
# It makes one Gemini call, so it is run by hand, not on every PR.
set -euo pipefail

out=$(curl -sS -X POST https://ask.sethshoultes.com/chat \
  -H 'Origin: https://sethshoultes.com' -H 'Content-Type: application/json' \
  -d '{"messages":[{"role":"user","content":"What services does Seth offer?"}]}')

if echo "$out" | python3 -c 'import sys,json; assert json.load(sys.stdin).get("answer")' 2>/dev/null; then
  echo "ok: Ask Seth's AI answered"
else
  echo "FAIL: /chat did not return an answer: $out" >&2
  exit 1
fi
