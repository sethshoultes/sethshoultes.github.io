#!/usr/bin/env bash
# Shared deploy script for the standalone games embedded in this Jekyll
# site (arcade epic #41: moving each onto its own hetzner-sites subdomain).
# One script for every game here — do not fork a second near-identical
# copy for the next one; extend the build step below if a future game
# needs something this one doesn't.
#
# Usage: scripts/deploy-game.sh <slug> <source-path>
#   slug          short name. Becomes build/<slug>/ and, by default, the
#                 CloudPanel site-user + domain:
#                 /home/<slug>/htdocs/<slug>.adventurebuildr.com
#   source-path   path (relative to repo root) to the game's file or
#                 directory
#
# Build step: these pages have no Jekyll front matter (checked per-game
# before adding them here) and are served byte-for-byte, no Jekyll
# processing.
#   - source-path is a single file            -> copied to
#                                                 build/<slug>/index.html
#   - source-path is a directory, no build    -> whole tree copied as-is
#     script in its package.json                 into build/<slug>/ (must
#                                                 contain its own index.html)
#   - source-path is a directory with a       -> `npm install && npm run
#     package.json "build" script (e.g.          build` run in source-path,
#     joust-1980, a Vite app, arcade#47)          then its dist/ is copied
#                                                 into build/<slug>/
# build/ is gitignored — it's regenerated from source-path each run, never
# committed. node_modules/dist inside source-path are the game repo's own
# concern (already gitignored there for joust-1980) — this script installs
# and builds in place, never commits build output.
#
# arcade epic #41: this dev has no ssh access and does not run this script
# itself — the arcade lead does, after confirming REMOTE_HOST/REMOTE_PATH
# match the vhost it sets up.
set -euo pipefail

SLUG="${1:?usage: deploy-game.sh <slug> <source-path>}"
SOURCE="${2:?usage: deploy-game.sh <slug> <source-path>}"

# Personal secrets (e.g. an ssh config alias's key, if one isn't already in
# ~/.ssh/config), if present. Sourced silently — never echo this file's
# contents.
SECRETS_FILE="$HOME/.config/dev-secrets/arcade/secrets.env"
if [ -f "$SECRETS_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$SECRETS_FILE"
  set +a
fi

# hetzner-sites is the box every other arcade game deploys to. It's a
# CloudPanel box, so the webroot is /home/<site-user>/htdocs/<domain>, not
# /var/www/<domain>. Override either var for a game whose slug doesn't
# match its site-user/domain 1:1.
REMOTE_HOST="${GAME_DEPLOY_HOST:-hetzner-sites}"
REMOTE_PATH="${GAME_DEPLOY_PATH:-/home/$SLUG/htdocs/$SLUG.adventurebuildr.com}"

BUILD_DIR="build/$SLUG"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

if [ -f "$SOURCE" ]; then
  cp "$SOURCE" "$BUILD_DIR/index.html"
elif [ -d "$SOURCE" ]; then
  if [ -f "$SOURCE/package.json" ] && grep -q '"build"[[:space:]]*:' "$SOURCE/package.json"; then
    ( cd "$SOURCE" && npm install && npm run build )
    DIST_DIR="$SOURCE/dist"
    if [ ! -d "$DIST_DIR" ]; then
      echo "deploy-game.sh: $DIST_DIR missing after npm run build" >&2
      exit 1
    fi
    cp -R "$DIST_DIR"/. "$BUILD_DIR"/
  else
    cp -R "$SOURCE"/. "$BUILD_DIR"/
  fi
else
  echo "deploy-game.sh: $SOURCE not found" >&2
  exit 1
fi

if [ ! -f "$BUILD_DIR/index.html" ]; then
  echo "deploy-game.sh: $BUILD_DIR/index.html missing after build — source needs its own index.html, or be a single file" >&2
  exit 1
fi

rsync -avz --delete "$BUILD_DIR/" "$REMOTE_HOST:$REMOTE_PATH/"
