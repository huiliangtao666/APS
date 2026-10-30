#!/usr/bin/env bash
set -euo pipefail
: "${DEC0203_REPO:?Absolute checkout path}"
: "${DEC0203_OUT:?New empty absolute evidence directory}"
# Uses prepared QA dependencies; no live app binding or business DB is touched.
[[ -d "$DEC0203_OUT" && -z $(ls -A "$DEC0203_OUT") ]] || exit 2
mkdir "$DEC0203_OUT/regression" "$DEC0203_OUT/repair"
DEC0203_OUT="$DEC0203_OUT/regression" bash "$DEC0203_REPO/qa/dec0203-docker.sh"
docker run --rm --init --mount "type=bind,src=$DEC0203_REPO,dst=/input,readonly" --mount "type=bind,src=$DEC0203_OUT/repair,dst=/evidence" aps-fr038-qa-runtime:latest bash -lc '
set -e
cd /workspace/apps/aps-fr032
tar -C /input --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -xf -
node --experimental-strip-types --test qa/dec0203-repair-r1.test.mjs > /evidence/focused.log 2>&1
npx playwright install chromium --only-shell > /evidence/browser-install.log 2>&1
node --experimental-strip-types qa/dec0203-repair-r1-browser.mjs > /evidence/browser.log 2>&1
'
