#!/usr/bin/env bash
# Finite follow-up acceptance; no app binding/publication. Run from host with Docker.
set -euo pipefail
: "${FR034_REPO:?Absolute source checkout required}"
: "${FR034_SDK:?Absolute existing SDK archive directory required}"
: "${FR034_OUT:?New empty absolute evidence directory required}"
[[ -d "$FR034_OUT" && -z $(ls -A "$FR034_OUT") ]] || exit 2
docker run --rm --init \
 --mount "type=bind,src=$FR034_REPO,dst=/input,readonly" \
 --mount "type=bind,src=$FR034_SDK,dst=/workspace/.praetor/sdk,readonly" \
 --mount "type=bind,src=$FR034_OUT,dst=/evidence" \
 -e FR034_PRODUCT_SHA -e FR034_SOURCE_MANIFEST -e FR034_PRODUCT_LABEL node:22-slim bash -lc '
 mkdir -p /workspace/apps/aps-fr032 && cp -a /input/. /workspace/apps/aps-fr032/ &&
 cd /workspace/apps/aps-fr032 && rm -rf node_modules dist &&
 npm ci --no-audit --no-fund &&
 npm install --no-save --package-lock=false --ignore-scripts playwright@1.56.1 &&
 npx playwright install --with-deps chromium &&
 FR033_DISPOSABLE_VALIDATION=1 node --experimental-strip-types qa/fr034-boundary-browser.mjs'
