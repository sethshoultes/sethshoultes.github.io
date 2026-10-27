#!/bin/bash
# sethshoultes.github.io#135: the twice-weekly blog post, run from launchd on Seth's Mac.
# launchd runs this Tue and Fri at 07:00 local (= 09:00 ET, the old Actions slot;
# ops/com.sethshoultes.daily-blog.plist). Every word is written by `claude -p` on the signed-in
# Claude subscription: no Anthropic API key anywhere. Only the featured image needs a key
# (OPENAI_API_KEY from ~/.config/dev-secrets/secrets.env), and RESEND_API_KEY for the failure email.
# The idea source is the local ~/brain clone (post-warehouse), not a token.
#
# Runs in its own detached worktree on main so it never touches a pane's checkout, then pushes
# the commit to main. Whole body is one { ... } block so bash reads it all before running any of it
# (same reason as ops/li-share-run.sh).
{
set -u
export PATH="/Users/sethshoultes/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
REPO="$HOME/projects/sethshoultes.github.io"
WT="$REPO/.claude/worktrees/daily-blog-runner"
mkdir -p "$HOME/Library/Logs"
[ -d "$WT" ] || git -C "$REPO" worktree add -q --detach "$WT" origin/main
cd "$WT" || exit 1
git fetch -q origin && git checkout -q --detach -f origin/main && git clean -fdq

set -a
. "$HOME/.config/dev-secrets/secrets.env"
set +a
export BRAIN_DIR="$HOME/brain" NOTIFY_EMAIL="seth@caseproof.com" NOTIFY_FROM="noreply@sethshoultes.com"

python3 scripts/daily_blog.py
exit $?
}
