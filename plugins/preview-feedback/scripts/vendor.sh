#!/usr/bin/env bash
# Rebuilds assets/modern-screenshot.mjs (the library the client uses to picture the pinned spot) from the version pinned
# in package-lock.json, with its licence and a sha256 the tests check, so the vendored file cannot change unseen.
set -euo pipefail
cd "$(dirname "$0")/.."
npm ci --no-audit --no-fund --ignore-scripts >/dev/null
cp node_modules/modern-screenshot/dist/index.mjs assets/modern-screenshot.mjs
cp node_modules/modern-screenshot/LICENSE assets/modern-screenshot.LICENSE
shasum -a 256 assets/modern-screenshot.mjs | cut -d' ' -f1 > assets/modern-screenshot.mjs.sha256
rm -rf node_modules
echo "vendored modern-screenshot $(node -p "require('./package-lock.json').packages['node_modules/modern-screenshot'].version")"
