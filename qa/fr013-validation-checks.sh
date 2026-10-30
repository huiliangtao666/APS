#!/usr/bin/env bash
# Run from checkout inside a disposable APS app container with dependencies.
set -euo pipefail
: "${FR013_OUT:=/evidence}"
mkdir -p "$FR013_OUT"
npm run build > "$FR013_OUT/build.log" 2>&1
FR013_EVIDENCE="$FR013_OUT/api" node --experimental-strip-types --test qa/fr013-validation.test.mjs > "$FR013_OUT/validation.log" 2>&1
npm test > "$FR013_OUT/npm-test.log" 2>&1
node --experimental-strip-types --test qa/issue4-0708.test.mjs qa/issue4-0204.test.mjs qa/fr013-main.test.mjs qa/p08.test.mjs qa/worker-build.test.mjs qa/confirmation.test.mjs > "$FR013_OUT/regression.log" 2>&1
npx playwright install chromium --only-shell > "$FR013_OUT/browser-install.log" 2>&1
node --experimental-strip-types qa/fr013-validation-browser.mjs > "$FR013_OUT/browser.log" 2>&1
