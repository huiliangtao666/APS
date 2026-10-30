#!/usr/bin/env bash
set -euo pipefail
: "${FR016_REPO:?Absolute checkout}"
: "${FR016_OUT:?New empty absolute evidence directory}"
[[ -d "$FR016_OUT" && -z $(ls -A "$FR016_OUT") ]] || exit 2
docker run --rm --init --user root --mount "type=bind,src=$FR016_REPO,dst=/input,readonly" --mount "type=bind,src=$FR016_OUT,dst=/evidence" aps-fr038-qa-runtime:latest bash -lc '
cd /workspace/apps/aps-fr032
tar -C /input --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -xf -
node qa/fr016-check.mjs
node qa/raw01-check.mjs
npx playwright install chromium --only-shell
node --experimental-strip-types qa/fr016-acceptance.mjs
npm run build > /evidence/build.log 2>&1
node qa/fr016-check.mjs
node qa/raw01-check.mjs
'
