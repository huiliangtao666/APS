#!/usr/bin/env bash
set -euo pipefail
mkdir -p /evidence/tests
node qa/fr027-check.mjs
node --experimental-strip-types --test qa/fr027.test.mjs > /evidence/tests/fr027.log 2>&1
sed 's@qa/fr038-source-sha256.json@qa/fr027-source-sha256.json@g;s/FR038-working-source/FR027-working-source/g' qa/fr038-checks.sh > /tmp/fr027-integrated-checks.sh
bash /tmp/fr027-integrated-checks.sh
node --experimental-strip-types --test qa/fr036-contract.test.mjs > /evidence/tests/fr036-contract.log 2>&1
FR033_DISPOSABLE_VALIDATION=1 FR034_SOURCE_MANIFEST=qa/fr027-source-sha256.json FR034_PRODUCT_LABEL=FR027-working-source node --experimental-strip-types qa/fr036-browser.mjs
node --experimental-strip-types qa/fr027-browser.mjs
node qa/fr027-check.mjs
