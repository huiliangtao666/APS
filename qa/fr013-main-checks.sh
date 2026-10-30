#!/usr/bin/env bash
set -euo pipefail
node qa/fr013-main-check.mjs
mkdir -p /evidence/tests
node --experimental-strip-types --test qa/fr013-main.test.mjs > /evidence/tests/fr013-main.log 2>&1 || { cat /evidence/tests/fr013-main.log; exit 1; }
node --experimental-strip-types --test qa/fr027.test.mjs > /evidence/tests/fr027.log 2>&1
node --experimental-strip-types --test qa/fr036-contract.test.mjs > /evidence/tests/fr036-contract.log 2>&1
sed 's@qa/fr038-source-sha256.json@qa/fr013-main-source-sha256.json@g;s/FR038-working-source/FR013-main-working-source/g' qa/fr038-checks.sh > /tmp/fr013-integrated-checks.sh
bash /tmp/fr013-integrated-checks.sh
FR033_DISPOSABLE_VALIDATION=1 FR034_SOURCE_MANIFEST=qa/fr013-main-source-sha256.json FR034_PRODUCT_LABEL=FR013-main-working-source node --experimental-strip-types qa/fr036-browser.mjs
node --experimental-strip-types qa/fr027-browser.mjs
node --experimental-strip-types qa/fr013-main-browser.mjs
node --experimental-strip-types qa/fr013-main-atomic.mjs
node qa/fr013-main-check.mjs
