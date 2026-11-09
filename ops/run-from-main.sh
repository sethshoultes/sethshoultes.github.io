#!/bin/bash
# Runs one of this repo's launchd jobs from a fresh worktree of origin/main, then removes it.
#
# launchd used to run each job's script inside a long-lived worktree under .claude/worktrees/, and the
# worktree sweep removed it: com.sethshoultes.daily-blog and com.sethshoultes.seth-li-share both exited 127
# from 2026-10-28 on, with no post published (lead, 2026-11-09). So this launcher lives OUTSIDE every
# checkout, at ~/.local/share/sethshoultes-site/run-from-main.sh, and each run makes its own worktree under
# ~/.local/share/sethshoultes-site/runs/, which no sweep touches. The job script always comes from
# origin/main, so a job can never run a stale copy.
#
# Usage (from a plist): run-from-main.sh <job name> <script path in the repo>
#
# Install or update, from a checkout of main:
#   install -d ~/.local/share/sethshoultes-site
#   install -m 0755 ops/run-from-main.sh ~/.local/share/sethshoultes-site/run-from-main.sh
#   cp ops/com.sethshoultes.daily-blog.plist ops/com.sethshoultes.seth-li-share.plist ~/Library/LaunchAgents/
#   for j in daily-blog seth-li-share; do launchctl bootout gui/$(id -u)/com.sethshoultes.$j 2>/dev/null
#     launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.sethshoultes.$j.plist; done
#
# The whole body is one { ... } block so bash reads it all before running any of it (caseproofagent/opal#72).
{
set -u
export PATH="/Users/sethshoultes/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
JOB="${1:?usage: run-from-main.sh <job> <script>}"
SCRIPT="${2:?usage: run-from-main.sh <job> <script>}"
REPO="$HOME/projects/sethshoultes.github.io"
RUNS="$HOME/.local/share/sethshoultes-site/runs"
mkdir -p "$RUNS"

# A run that was killed leaves its worktree behind; clear this job's before making a new one.
for old in "$RUNS/$JOB"-*; do
  [ -d "$old" ] && { git -C "$REPO" worktree remove --force "$old" 2>/dev/null || rm -rf "$old"; }
done
git -C "$REPO" worktree prune

WT="$RUNS/$JOB-$(date +%Y%m%dT%H%M%S)"
git -C "$REPO" fetch -q origin || { echo "$(date -u +%FT%TZ) $JOB: git fetch failed"; exit 1; }
git -C "$REPO" worktree add -q --detach "$WT" origin/main || { echo "$(date -u +%FT%TZ) $JOB: worktree add failed"; exit 1; }
trap 'git -C "$REPO" worktree remove --force "$WT" 2>/dev/null || rm -rf "$WT"; git -C "$REPO" worktree prune' EXIT

cd "$WT" || exit 1
echo "$(date -u +%FT%TZ) $JOB: running $SCRIPT at $(git rev-parse --short HEAD)"
bash "$WT/$SCRIPT"
exit $?
}
