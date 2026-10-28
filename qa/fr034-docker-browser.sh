#!/usr/bin/env bash
# Run from a host with Docker. All install/build/server/browser work stays in one disposable container.
set -euo pipefail
: "${FR034_REPO:?Absolute checkout directory required}"
: "${FR034_SDK:?Absolute directory containing the two existing SDK tgz required}"
: "${FR034_OUT:?New empty absolute output directory required}"
[[ -d "$FR034_OUT" && -z $(ls -A "$FR034_OUT") ]] || { echo 'Output must exist and be empty' >&2; exit 2; }
docker run --rm --init --user root \
 --mount "type=bind,src=$FR034_REPO,dst=/input,readonly" \
 --mount "type=bind,src=$FR034_SDK,dst=/workspace/.praetor/sdk,readonly" \
 --mount "type=bind,src=$FR034_OUT,dst=/evidence" \
 node:22-slim bash -lc '
 mkdir -p /workspace/apps/aps-fr034 && cp -a /input/. /workspace/apps/aps-fr034/ &&
 cd /workspace/apps/aps-fr034 && rm -rf node_modules dist &&
 npm ci --no-audit --no-fund &&
 npm install --no-save --package-lock=false --ignore-scripts playwright@1.56.1 &&
 npx playwright install --with-deps chromium &&
 FR033_DISPOSABLE_VALIDATION=1 node --experimental-strip-types qa/fr034-browser.mjs'
