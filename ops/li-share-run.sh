#!/bin/bash
# sethshoultes.github.io#70: share each new sethshoultes.com post on Seth's own LinkedIn.
# launchd runs this once a day at 09:30 local (ops/com.sethshoultes.seth-li-share.plist), kept
# >=1h clear of caseproofagent/memberpress-ai-cast#151's 07:15/11:30/15:45 slots, since both read
# the same ~/.config/dev-secrets/seth-linkedin/secrets.env that cast#153's sign-in script writes.
# This script never signs Seth in and never writes that file; it only reads it.
#
# Runs in its own detached worktree on main so it never touches a pane's checkout. The dedup log
# (data/li-shared.log) is copied in before the run and back out after, into $STATE outside the
# worktree, the same way caseproofagent/memberpress-ai-cast's ops/x-schedule-run.sh keeps
# data/x-posts.log — a lost or pruned worktree must not re-share everything.
#
# The whole body is one { ... } block so bash reads it all before running any of it (the byte-
# offset bug that silently skipped a step after `git checkout` replaced this very file under a
# running bash process: caseproofagent/opal#72).
{
set -u
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
REPO="$HOME/projects/sethshoultes.github.io"
WT="$REPO/.claude/worktrees/li-share-runner"
STATE="$HOME/.local/share/seth-li-share"
mkdir -p "$STATE"
[ -d "$WT" ] || git -C "$REPO" worktree add -q --detach "$WT" origin/main
cd "$WT" || exit 1
git fetch -q origin && git checkout -q --detach -f origin/main
[ -f "$STATE/li-shared.log" ] && cp -p "$STATE/li-shared.log" data/li-shared.log

python3 scripts/linkedin_share.py --live 2>&1 | tee "$STATE/last-run.log"
rc=${PIPESTATUS[0]}

[ -f data/li-shared.log ] && cp -p data/li-shared.log "$STATE/li-shared.log"

if [ "$rc" -ne 0 ]; then
  gh issue comment 70 -R sethshoultes/sethshoultes.github.io --body "Scheduled LinkedIn share failed (exit $rc) at $(date -u +%FT%TZ) on the Mac launchd job. Not retrying; tomorrow's run picks up the same unshared post. Log: $(tail -3 "$STATE/last-run.log")

— seth-li-share (launchd)"
fi
exit "$rc"
}
