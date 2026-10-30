#!/bin/bash
# Fixed checkout; isolated Docker runtime, no host install/start or shared store.
set -euo pipefail
: "${P10_REPO:?absolute fixed checkout}"
: "${P10_OUT:?new evidence directory}"
mkdir -p "$P10_OUT/parent-source"
git -C "$P10_REPO" archive 7ae4ca827276c66b276c4cc32a4593825ee2623f | tar -x -C "$P10_OUT/parent-source"
docker image inspect aps-fr038-qa-runtime:latest --format '{{json .Id}}' > "$P10_OUT/runtime-image.json"
docker run --rm --init --mount "type=bind,src=$P10_REPO,dst=/input,readonly" --mount "type=bind,src=$P10_OUT,dst=/evidence" aps-fr038-qa-runtime:latest bash -lc '
set -e
cd /workspace/apps/aps-fr032
rm -rf src server qa
cp -R /input/src /input/server /input/qa .
cp /input/package.json /input/tsconfig.json /input/vite.config.ts .
node --version > /evidence/node-version.txt
node qa/p10-source.mjs
node --experimental-strip-types --test qa/p10-explicit.test.mjs qa/p10-core.test.mjs qa/p10-e01.test.mjs qa/p06.test.mjs qa/r01r02.test.mjs qa/joint-resources.test.mjs > /evidence/targeted.log 2>&1
node --experimental-strip-types --test qa/p08.test.mjs qa/s06.test.mjs qa/dec0203-repair-r1.test.mjs qa/resource-load.test.mjs qa/fr034-resource-explain.test.mjs qa/condition-trials.test.mjs qa/production-batches.test.mjs qa/material-allocation.test.mjs > /evidence/regression.log 2>&1
npm test > /evidence/npm-test.log 2>&1
npm run build > /evidence/build.log 2>&1
npx playwright install chromium --only-shell > /evidence/browser-install.log 2>&1
node --experimental-strip-types qa/p10-explicit-browser.mjs > /evidence/browser.log 2>&1
mkdir -p /parent
cp -R /evidence/parent-source/. /parent/
ln -s /workspace/apps/aps-fr032/node_modules /parent/node_modules
P10_PARENT_ROOT=/parent node --experimental-strip-types qa/p10-explicit-upgrade.mjs > /evidence/parent-upgrade.log 2>&1
'
