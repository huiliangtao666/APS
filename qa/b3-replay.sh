#!/usr/bin/env bash
set -euo pipefail
out="${EVIDENCE_DIR:?isolated evidence directory required}"
fixtures="${B3_FIXTURE_DIR:?isolated fixture directory required}"
mkdir -p "$out/targeted" "$out/browser"
node --experimental-strip-types qa/b3-material-fixture.mjs "$fixtures"
npm run build > "$out/build.log" 2>&1
npm test > "$out/npm-test.log" 2>&1
npm run test:query-ui > "$out/query-ui.log" 2>&1
EVIDENCE_DIR="$out/targeted" node --experimental-strip-types --test qa/b3-material.test.mjs qa/issue9.test.mjs qa/joint-resources.test.mjs qa/confirmation.test.mjs qa/condition-trials.test.mjs qa/fr013-validation.test.mjs qa/issue4-original09.test.mjs qa/worker-build.test.mjs > "$out/targeted.log" 2>&1
if [[ ${B3_SYSTEM_BROWSER_LIBS:-0} == 1 ]]; then
 EVIDENCE_DIR="$out/browser" node --experimental-strip-types qa/b3-material-browser.mjs > "$out/browser.log" 2>&1
else
 EVIDENCE_DIR="$out/browser" bash qa/b3-browser-runtime.sh > "$out/browser.log" 2>&1
fi
printf '%s\n' 'PASS build, npm test, query UI, targeted regression, actual browser; run independent Python CSV oracle separately.'
