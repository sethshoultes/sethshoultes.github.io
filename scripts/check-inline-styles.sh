#!/usr/bin/env bash
# Fail if a page, post, layout or include carries an inline style="..." attribute.
# Styles belong in a class in assets/site.css, blog/blog.css or recipes/recipe.css.
#
# Excluded on purpose: the games and arcade, vendored builds, standalone sub-sites that
# carry their own stylesheet (garage-door-science-hub), docs and tooling.
# Run from the repo root:  scripts/check-inline-styles.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

excluded='^(advanced-typing-games|game-center|typing-games|garage-door-science-hub|data|build|docs|admin|wordpress-plugins|ops|workers|scripts|\.github)/'

hits=$(git ls-files -z '*.html' '*.md' \
  | tr '\0' '\n' | grep -Ev "$excluded" | tr '\n' '\0' \
  | xargs -0 grep -nH 'style="' 2>/dev/null || true)

if [ -n "$hits" ]; then
  echo "Inline styles found. Move each to a class in assets/site.css (or blog/blog.css):" >&2
  echo "$hits" >&2
  exit 1
fi
echo "ok: no inline styles"
