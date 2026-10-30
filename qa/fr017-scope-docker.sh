#!/usr/bin/env bash
set -euo pipefail
: "${FR017_REPO:?Absolute checkout path}"
: "${FR017_OUT:?Absolute evidence directory containing parent.tar}"
[[ -f "$FR017_OUT/parent.tar" ]] || exit 2
docker run --rm --init --mount "type=bind,src=$FR017_REPO,dst=/input,readonly" --mount "type=bind,src=$FR017_OUT,dst=/evidence" "${FR017_QA_IMAGE:-aps-fr038-qa-runtime:latest}" bash -lc '
set -e
cd /workspace/apps/aps-fr032
tar -C /input --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -xf -
mkdir /tmp/fr017-parent
tar -xf /evidence/parent.tar -C /tmp/fr017-parent
ln -s /workspace/apps/aps-fr032/node_modules /tmp/fr017-parent/node_modules
node --experimental-strip-types qa/fr017-migration.mjs
npm test > /evidence/full-test.log 2>&1
node --experimental-strip-types --test qa/fr017-scope.test.mjs qa/dec0203.test.mjs qa/dec0203-repair-r1.test.mjs qa/s06.test.mjs > /evidence/scoped-final.log 2>&1
npm run build > /evidence/build-final.log 2>&1
npx playwright install chromium --only-shell > /evidence/browser-install.log 2>&1
FR017_OUT=/evidence/final-browser node --experimental-strip-types qa/fr017-scope-browser.mjs > /evidence/browser.log 2>&1
'
