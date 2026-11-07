#!/usr/bin/env bash
# Markdown twins for agents (agent-files, site-kit#114) on a built site: usage scripts/markdown-twins.sh _site https://sethshoultes.com
# twins.mjs throws when any indexable page has no <main>, and 18 standalone game and hub pages here have none (site-kit#193).
# So the twins are made on a copy without those pages, and only the index.md files are copied back: those pages simply have no twin.
set -euo pipefail
dist="${1:?built site folder}"; origin="${2:?origin}"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
cp -R "$dist/." "$tmp/"
find "$tmp" -mindepth 2 -name index.html > "$tmp.list"
while read -r f; do
  [ -f "$f" ] || continue   # a parent folder already went
  grep -qiE '<main[ >]|noindex' "$f" || rm -rf -- "$(dirname "$f")"
done < "$tmp.list"
rm -f "$tmp.list"
node plugins/agent-files/scripts/twins.mjs "$tmp" --origin "$origin"
rsync -a --include='*/' --include='index.md' --exclude='*' "$tmp/" "$dist/"
