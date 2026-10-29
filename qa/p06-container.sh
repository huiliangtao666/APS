#!/bin/bash
# Host orchestration only; all Node/build/browser work runs in disposable Docker.
set -euo pipefail
: "${P06_REPO:?absolute path to this fixed checkout}"
: "${P06_OUT:?absolute path to a new evidence directory}"
P06_QA_IMAGE="${P06_QA_IMAGE:-aps-fr038-qa-runtime:latest}"
mkdir -p "$P06_OUT/parent-source"
git -C "$P06_REPO" archive 2016258169074d1e29292e5a3e58a0fa9304b4bf | tar -x -C "$P06_OUT/parent-source"
docker image inspect "$P06_QA_IMAGE" --format '{{json .Id}}' > "$P06_OUT/runtime-image.json"
docker run --rm --init --mount "type=bind,src=$P06_REPO,dst=/input,readonly" --mount "type=bind,src=$P06_OUT/parent-source,dst=/parent-input,readonly" --mount "type=bind,src=$P06_OUT,dst=/evidence" "$P06_QA_IMAGE" bash -lc '
set -e
cd /workspace/apps/aps-fr032
tar -C /input --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -xf -
node --version > /evidence/node-version.txt
node --experimental-strip-types --test qa/p06.test.mjs qa/r01r02.test.mjs qa/joint-resources.test.mjs qa/p10-core.test.mjs > /evidence/targeted.log 2>&1
node --experimental-strip-types --test qa/p08.test.mjs qa/s06.test.mjs qa/dec0203-repair-r1.test.mjs qa/resource-load.test.mjs qa/fr034-resource-explain.test.mjs qa/condition-trials.test.mjs qa/production-batches.test.mjs qa/material-allocation.test.mjs > /evidence/regression.log 2>&1
npm test > /evidence/npm-test.log 2>&1
npm run build > /evidence/build.log 2>&1
npx playwright install chromium --only-shell > /evidence/browser-install.log 2>&1
node --experimental-strip-types qa/p06-browser.mjs > /evidence/p06-browser.log 2>&1
node --experimental-strip-types qa/r01r02-browser.mjs > /evidence/joint-browser.log 2>&1
mkdir -p /parent
tar -C /parent-input -cf - . | tar -C /parent -xf -
ln -s /workspace/apps/aps-fr032/node_modules /parent/node_modules
P06_PARENT_ROOT=/parent node --experimental-strip-types qa/p06-upgrade.mjs > /evidence/p06-upgrade.log 2>&1
'
