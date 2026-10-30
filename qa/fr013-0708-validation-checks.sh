#!/usr/bin/env bash
# Isolated disposable container; does not start/change the workspace preview.
set -euo pipefail
: "${FR013_REPO:?absolute checkout of fixed SHA}"
: "${FR013_OUT:?absolute evidence directory}"
: "${FR013_IMAGE:=aps-fr038-qa-runtime:latest}"
mkdir -p "$FR013_OUT"
docker run --rm --init --mount "type=bind,src=$FR013_REPO,dst=/input,readonly" --mount "type=bind,src=$FR013_OUT,dst=/evidence" "$FR013_IMAGE" bash -lc '
set -euo pipefail
cd /workspace/apps/aps-fr032
rm -rf src server qa public dist prototypes
tar -C /input --exclude=.git --exclude=node_modules --exclude=dist -cf - . | tar -xf -
node --version > /evidence/node.txt
npm run build > /evidence/build.log 2>&1
FR013_EVIDENCE=/evidence node --experimental-strip-types --test qa/fr013-validation.test.mjs qa/issue4-0708.test.mjs qa/p08.test.mjs > /evidence/targeted.log 2>&1
npm test > /evidence/npm-test.log 2>&1
npx playwright install chromium --only-shell > /evidence/browser-install.log 2>&1
node --experimental-strip-types qa/fr013-validation-browser.mjs > /evidence/browser.log 2>&1
'
