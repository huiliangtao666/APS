#!/bin/bash
# Run from the VM host. All Node builds, servers and browser work stay in Docker.
set -euo pipefail
: "${P10_REPO:?absolute path to this checkout}"
: "${P10_OUT:?absolute path to a new evidence directory}"
P10_QA_IMAGE="${P10_QA_IMAGE:-aps-fr038-qa-runtime:latest}"
mkdir -p "$P10_OUT/legacy-source"
git -C "$P10_REPO" archive e0be9b6dfbf9be7ce404edc1b80d8c50858ed3dc | tar -x -C "$P10_OUT/legacy-source"
docker image inspect "$P10_QA_IMAGE" --format '{{json .Id}}' > "$P10_OUT/runtime-image.json"
docker run --rm --init --mount "type=bind,src=$P10_REPO,dst=/input,readonly" --mount "type=bind,src=$P10_OUT/legacy-source,dst=/legacy,readonly" --mount "type=bind,src=$P10_OUT,dst=/evidence" "$P10_QA_IMAGE" bash -lc '
set -e
cd /workspace/apps/aps-fr032
tar -C /input --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -xf -
node --version > /evidence/node-version.txt
node --experimental-strip-types --test qa/p10-core.test.mjs > /evidence/p10-tests.log 2>&1
node --experimental-strip-types --test qa/p08.test.mjs qa/s06.test.mjs qa/dec0203-repair-r1.test.mjs qa/resource-load.test.mjs qa/fr034-resource-explain.test.mjs qa/condition-trials.test.mjs > /evidence/regression.log 2>&1
npm test > /evidence/npm-test.log 2>&1
npm run build > /evidence/build.log 2>&1
npx playwright install chromium --only-shell > /evidence/browser-install.log 2>&1
node --experimental-strip-types qa/p10-core-browser.mjs > /evidence/p10-browser.log 2>&1
mkdir -p /workspace/apps/aps-legacy
tar -C /legacy -cf - . | tar -C /workspace/apps/aps-legacy -xf -
ln -s /workspace/apps/aps-fr032/node_modules /workspace/apps/aps-legacy/node_modules
P10_LEGACY_ROOT=/workspace/apps/aps-legacy node --experimental-strip-types qa/p10-core-upgrade.mjs > /evidence/p10-upgrade.log 2>&1
'
