#!/bin/bash
# Run on host; every Node process stays inside isolated Docker, never the bound app.
set -euo pipefail
: "${JOINT_REPO:?absolute path to this checkout}"
: "${JOINT_OUT:?absolute path to a new evidence directory}"
JOINT_QA_IMAGE="${JOINT_QA_IMAGE:-aps-fr038-qa-runtime:latest}"
mkdir -p "$JOINT_OUT/legacy-source"
git -C "$JOINT_REPO" archive beae5b4ff309f0e108bebf16f96f9c0a69297f89 | tar -x -C "$JOINT_OUT/legacy-source"
docker image inspect "$JOINT_QA_IMAGE" --format '{{json .Id}}' > "$JOINT_OUT/runtime-image.json"
docker run --rm --init --mount "type=bind,src=$JOINT_REPO,dst=/input,readonly" --mount "type=bind,src=$JOINT_OUT/legacy-source,dst=/oldsrc,readonly" --mount "type=bind,src=$JOINT_OUT,dst=/evidence" "$JOINT_QA_IMAGE" bash -lc '
set -e
cd /workspace/apps/aps-fr032
tar -C /input --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -xf -
node --version > /evidence/node-version.txt
node --experimental-strip-types --test qa/r01r02.test.mjs qa/joint-resources.test.mjs qa/p10-core.test.mjs > /evidence/targeted.log 2>&1
node --experimental-strip-types --test qa/p08.test.mjs qa/s06.test.mjs qa/dec0203-repair-r1.test.mjs qa/resource-load.test.mjs qa/fr034-resource-explain.test.mjs qa/condition-trials.test.mjs qa/production-batches.test.mjs qa/material-allocation.test.mjs > /evidence/regression.log 2>&1
npm test > /evidence/npm-test.log 2>&1
npm run build > /evidence/build.log 2>&1
npx playwright install chromium --only-shell > /evidence/browser-install.log 2>&1
node --experimental-strip-types qa/r01r02-browser.mjs > /evidence/joint-browser.log 2>&1
node --experimental-strip-types qa/p10-core-browser.mjs > /evidence/p10-browser.log 2>&1
mkdir -p /legacy
tar -C /oldsrc -cf - . | tar -C /legacy -xf -
ln -s /workspace/apps/aps-fr032/node_modules /legacy/node_modules
JOINT_LEGACY_ROOT=/legacy node --experimental-strip-types qa/r01r02-upgrade.mjs > /evidence/joint-upgrade.log 2>&1
'
