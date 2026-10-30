#!/bin/bash
# Host orchestration; no host Node installation or app process.
set -euo pipefail
: "${N06_REPO:?absolute fixed checkout}"
: "${N06_OUT:?absolute writable evidence directory}"
mkdir -p "$N06_OUT"
image="${N06_QA_IMAGE:-aps-fr038-qa-runtime:latest}"
docker image inspect "$image" --format '{{json .Id}}' > "$N06_OUT/runtime-image.json"
docker run --rm --init --mount "type=bind,src=$N06_REPO,dst=/input,readonly" --mount "type=bind,src=$N06_OUT,dst=/evidence" "$image" bash -lc '
set -e
cd /workspace/apps/aps-fr032
rm -rf src server
tar -C /input --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -xf -
node --version > /evidence/node-version.txt
node docs/n06-readiness/verify-source.mjs
npm run build > /evidence/build.log 2>&1
node --experimental-strip-types docs/n06-readiness/probe.mjs > /evidence/probe.log 2>&1
node --experimental-strip-types --test qa/dec0203-repair-r1.test.mjs qa/progress-impact.test.mjs qa/r01r02.test.mjs qa/p06.test.mjs > /evidence/regression.log 2>&1
npx playwright install chromium --only-shell > /evidence/browser-install.log 2>&1
node --experimental-strip-types qa/dec0203-repair-r1-browser.mjs > /evidence/browser.log 2>&1
'
