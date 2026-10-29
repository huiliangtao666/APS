#!/usr/bin/env bash
set -euo pipefail
: "${DEC0203_REPO:?Absolute checkout path}"
: "${DEC0203_OUT:?New empty absolute evidence directory}"
[[ -d "$DEC0203_OUT" && -z $(ls -A "$DEC0203_OUT") ]] || exit 2
# The prepared application QA runtime contains Node22, app dependencies, SDK,
# Playwright and react-test-renderer. No live workspace app or business DB used.
docker run --rm --init --mount "type=bind,src=$DEC0203_REPO,dst=/input,readonly" --mount "type=bind,src=$DEC0203_OUT,dst=/evidence" aps-fr038-qa-runtime:latest bash -lc '
set -e
cd /workspace/apps/aps-fr032
tar -C /input --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -xf -
node --experimental-strip-types --test qa/dec0203.test.mjs > /evidence/policy-unit.log 2>&1
npm test > /evidence/unit.log 2>&1
node --experimental-strip-types --test qa/raw01.test.mjs qa/fr014015.test.mjs qa/condition-trials.test.mjs qa/confirmation.test.mjs qa/fr036-contract.test.mjs qa/run-history.test.mjs qa/production-batches.test.mjs qa/timetable.test.mjs qa/resource-load.test.mjs qa/result-assessment.test.mjs qa/progress-impact.test.mjs qa/unknown-endpoints.test.mjs qa/fr027.test.mjs > /evidence/related.log 2>&1
for case_name in editor-interaction resource-panel; do
 npx esbuild "qa/$case_name.test.tsx" --jsx=automatic --bundle --platform=node --packages=external --format=cjs --outfile=".qa-$case_name.cjs" > "/evidence/$case_name-bundle.log" 2>&1
 node --test ".qa-$case_name.cjs" > "/evidence/$case_name.log" 2>&1
done
npm run build > /evidence/build.log 2>&1
npx playwright install chromium --only-shell > /evidence/browser-install.log 2>&1
node --experimental-strip-types qa/dec0203-browser.mjs > /evidence/browser.log 2>&1
'
