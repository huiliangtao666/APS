#!/usr/bin/env bash
# All dependencies, builds, servers and Chromium stay inside a disposable container.
set -euo pipefail
: "${ISSUE26_REPO:?Absolute checkout path}"
: "${ISSUE26_FIXTURE:?Absolute Test2 saved-business.json path}"
: "${ISSUE26_SDK:?Absolute SDK tgz directory}"
: "${ISSUE26_OUT:?Absolute empty evidence directory}"
[[ -d "$ISSUE26_OUT" && -z $(ls -A "$ISSUE26_OUT") ]] || exit 2
# Optional cached aps-fr038-qa-runtime:latest has the same lockfile dependencies and Chromium.
docker run --rm --init --cpus 2 --memory 4g --entrypoint bash \
 --mount "type=bind,src=$ISSUE26_REPO,dst=/input,readonly" \
 --mount "type=bind,src=$ISSUE26_FIXTURE,dst=/probe/test2/saved-business.json,readonly" \
 --mount "type=bind,src=$ISSUE26_SDK,dst=/workspace/.praetor/sdk,readonly" \
 --mount "type=bind,src=$ISSUE26_OUT,dst=/evidence" \
 -e PRODUCT_SHA -e PROBE_MODE "${ISSUE26_IMAGE:-node:22-slim}" -lc '
 mkdir -p /workspace/apps/aps-fr032
 cd /workspace/apps/aps-fr032
 cp -a /input/src /input/server /input/qa .
 cp /input/package*.json /input/*config* /input/index.html .
 if [ ! -d node_modules/playwright ]; then
   npm ci --no-audit --no-fund
   npm install --no-save --package-lock=false --ignore-scripts playwright@1.56.1
   npx playwright install --with-deps chromium
 fi
 npm run build > /evidence/build.log 2>&1
 node --experimental-strip-types qa/issue26-feedback-browser.mjs > /evidence/browser.log 2>&1'
