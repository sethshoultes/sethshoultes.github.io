#!/usr/bin/env bash
# Build the site and run the served-page checks (the site area of .github/test-map.json). Needs Ruby and the bundle.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
scripts/check-inline-styles.sh
bundle exec jekyll build
cp -R .well-known/agent-skills/. _site/.well-known/agent-skills/   # the SKILL.md files Jekyll leaves out (_config.yml), as they are
node scripts/check-links.mjs _site
node scripts/check-youtube.mjs _site
node assets/vendor/site-kit/check/kit-check.mjs _site
node plugins/sitemap-check/scripts/sitemap-check.mjs _site --origin https://sethshoultes.com
