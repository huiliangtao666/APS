#!/usr/bin/env bash
set -euo pipefail
: "${P08_REPO:?absolute checkout path}"
: "${P08_OUT:?absolute new evidence directory}"
mkdir -p "$P08_OUT"
docker run --rm --init --mount "type=bind,src=$P08_REPO,dst=/input,readonly" --mount "type=bind,src=$P08_OUT,dst=/evidence" aps-fr038-qa-runtime:latest bash -lc '
set -e
cd /workspace/apps/aps-fr032
tar -C /input --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -xf -
node --experimental-strip-types --test qa/p08.test.mjs qa/s06.test.mjs qa/dec0203*.test.mjs qa/raw01.test.mjs qa/fr014015*.test.mjs qa/confirmation*.test.mjs > /evidence/regression.log 2>&1
npm test > /evidence/npm-test.log 2>&1
npm run build > /evidence/build.log 2>&1
npx playwright install chromium --only-shell > /evidence/browser-install.log 2>&1
node --experimental-strip-types qa/p08-browser.mjs > /evidence/browser.log 2>&1
'
