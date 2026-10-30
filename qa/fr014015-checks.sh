#!/usr/bin/env bash
set -euo pipefail
node qa/fr014015-check.mjs
mkdir -p /evidence/tests
node --experimental-strip-types --test qa/fr014015.test.mjs > /evidence/tests/fr014015.log 2>&1
npx esbuild qa/fr014015-panel.test.tsx --jsx=automatic --bundle --platform=node --packages=external --format=cjs --outfile=.qa-fr014015.cjs > /evidence/tests/bundle-fr014015.log 2>&1
node --test .qa-fr014015.cjs > /evidence/tests/fr014015-panel.log 2>&1
node --experimental-strip-types --test qa/fr013-main.test.mjs > /evidence/tests/fr013-main.log 2>&1
node --experimental-strip-types --test qa/fr027.test.mjs > /evidence/tests/fr027.log 2>&1
node --experimental-strip-types --test qa/fr036-contract.test.mjs > /evidence/tests/fr036-contract.log 2>&1
sed 's@qa/fr038-source-sha256.json@qa/fr014015-source-sha256.json@g;s/FR038-working-source/FR014015-working-source/g' qa/fr038-checks.sh > /tmp/fr014015-integrated-checks.sh
bash /tmp/fr014015-integrated-checks.sh
FR033_DISPOSABLE_VALIDATION=1 FR034_SOURCE_MANIFEST=qa/fr014015-source-sha256.json FR034_PRODUCT_LABEL=FR014015-working-source node --experimental-strip-types qa/fr036-browser.mjs
node --experimental-strip-types qa/fr027-browser.mjs
node --experimental-strip-types qa/fr013-main-browser.mjs
node --experimental-strip-types qa/fr013-main-atomic.mjs
node --experimental-strip-types qa/fr014015-browser.mjs
node qa/fr014015-check.mjs
node qa/fr014015-summary.mjs
