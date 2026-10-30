#!/bin/bash
set -euo pipefail
: "${N06_REPO:?absolute fixed checkout path}"
: "${N06_OUT:?absolute isolated evidence directory}"
N06_IMAGE="${N06_IMAGE:-aps-fr038-qa-runtime:latest}"
mkdir -p "$N06_OUT"
docker image inspect "$N06_IMAGE" --format '{{json .Id}}' > "$N06_OUT/runtime-image.json"
docker run --rm --init --mount "type=bind,src=$N06_REPO,dst=/input,readonly" --mount "type=bind,src=$N06_OUT,dst=/evidence" "$N06_IMAGE" bash -lc '
set -e
cd /workspace/apps/aps-fr032
rm -rf src server qa
cp -R /input/src /input/server /input/qa .
cp /input/package.json /input/tsconfig.json /input/vite.config.ts .
node --version > /evidence/node-version.txt
node --experimental-strip-types --test qa/n06.test.mjs qa/p10-core.test.mjs qa/p10-e01.test.mjs qa/p06.test.mjs qa/r01r02.test.mjs qa/joint-resources.test.mjs > /evidence/targeted-final.log 2>&1
node --experimental-strip-types --test qa/p08.test.mjs qa/s06.test.mjs qa/dec0203-repair-r1.test.mjs qa/resource-load.test.mjs qa/fr034-resource-explain.test.mjs qa/condition-trials.test.mjs qa/production-batches.test.mjs qa/material-allocation.test.mjs > /evidence/regression-final.log 2>&1
npm test > /evidence/npm-test-final.log 2>&1
npm run build > /evidence/build-final.log 2>&1
npx playwright install chromium --only-shell > /evidence/browser-install.log 2>&1
node --experimental-strip-types qa/n06-browser.mjs > /evidence/n06-browser.log 2>&1
'
