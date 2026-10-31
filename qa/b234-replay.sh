#!/usr/bin/env bash
set -euo pipefail
: "${B234_OUT:?absolute isolated evidence directory}"
: "${B234_PRODUCT_SHA:?fixed 40-character product SHA}"
: "${B2_INPUTS:?untouched original B2 input directory}"
: "${B4_INPUTS:?untouched original B4 input directory}"
: "${B234_RAW_B3:?untouched original B3 input directory}"
export B3_FIXTURE_DIR="${B3_FIXTURE_DIR:-$B234_OUT/fixtures-b3}"
export B234_INPUTS_DIR="${B234_INPUTS_DIR:-$B234_OUT/fixtures-b234}"
mkdir -p "$B234_OUT" "$B234_OUT/b2" "$B234_OUT/b231" "$B234_OUT/b3" "$B234_OUT/b4" "$B234_OUT/joint" "$B234_OUT/browser-b2" "$B234_OUT/browser-b231" "$B234_OUT/browser-b3" "$B234_OUT/browser-joint"
node --version > "$B234_OUT/node-version.txt"
node --experimental-strip-types qa/b3-material-fixture.mjs "$B3_FIXTURE_DIR"
node --experimental-strip-types qa/b234-write-fixtures.mjs "$B234_INPUTS_DIR"
npm run build > "$B234_OUT/build.log" 2>&1
npm test > "$B234_OUT/npm-test.log" 2>&1
npm run test:query-ui > "$B234_OUT/query-ui.log" 2>&1
B2_EVIDENCE="$B234_OUT/b2" node --experimental-strip-types --test qa/b2-integrated.test.mjs > "$B234_OUT/b2.log" 2>&1
B2_EVIDENCE="$B234_OUT/b231" node --experimental-strip-types --test qa/b231-intake.test.mjs > "$B234_OUT/b231.log" 2>&1
EVIDENCE_DIR="$B234_OUT/b3" node --experimental-strip-types --test qa/b3-material.test.mjs qa/issue9.test.mjs qa/joint-resources.test.mjs qa/confirmation.test.mjs qa/condition-trials.test.mjs qa/fr013-validation.test.mjs qa/issue4-original09.test.mjs qa/worker-build.test.mjs > "$B234_OUT/b3.log" 2>&1
B4_EVIDENCE="$B234_OUT/b4" node --experimental-strip-types --test src/lib/process-cooling.test.mjs qa/b4-admission.test.mjs > "$B234_OUT/b4.log" 2>&1
B234_EVIDENCE="$B234_OUT/joint" node --experimental-strip-types --test qa/b234-integration.test.mjs > "$B234_OUT/joint.log" 2>&1
node --experimental-strip-types --test qa/p10-core.test.mjs qa/p10-explicit.test.mjs qa/uat-r21-integration.test.mjs qa/fr006-csv9-explicit.test.mjs qa/fr013-config.test.mjs qa/fr013-multisource.test.mjs > "$B234_OUT/resource-mapping-regression.log" 2>&1
export B2_PRODUCT_SHA="$B234_PRODUCT_SHA" B3_BUILD_SHA="$B234_PRODUCT_SHA"
B2_EVIDENCE="$B234_OUT/browser-b2" bash qa/b234-browser-runtime.sh node --experimental-strip-types qa/b2-browser.mjs > "$B234_OUT/browser-b2.log" 2>&1
B2_EVIDENCE="$B234_OUT/browser-b231" bash qa/b234-browser-runtime.sh node --experimental-strip-types qa/b231-browser.mjs > "$B234_OUT/browser-b231.log" 2>&1
EVIDENCE_DIR="$B234_OUT/browser-b3" bash qa/b234-browser-runtime.sh node --experimental-strip-types qa/b3-material-browser.mjs > "$B234_OUT/browser-b3.log" 2>&1
B234_EVIDENCE="$B234_OUT/browser-joint" bash qa/b234-browser-runtime.sh node --experimental-strip-types qa/b234-browser.mjs > "$B234_OUT/browser-joint.log" 2>&1
printf 'PASS application build, core, B2/B231/B3/B4 impacted and joint tests, actual React/API/Worker/browser, separate process restart.\n' > "$B234_OUT/replay.status"
# In an environment with Python3, independently execute (no product imports):
# python3 qa/b3-material-oracle.py "$B3_FIXTURE_DIR" "$B234_OUT/b3" "$B234_OUT/browser-b3"
# python3 qa/b234-oracle.py "$B234_INPUTS_DIR" "$B234_OUT/joint" "$B234_OUT/browser-joint"
