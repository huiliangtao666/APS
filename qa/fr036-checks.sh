#!/usr/bin/env bash
set -euo pipefail
# Existing suite commands unchanged; fresh FR036 manifest passed via this finite runner.
mkdir -p /evidence/tests
node --experimental-strip-types --test qa/fr036-contract.test.mjs > /evidence/tests/fr036-contract.log 2>&1
# Copy the integrated command list, changing only the source manifest/label in a disposable file.
sed 's@qa/fr038-source-sha256.json@qa/fr036-source-sha256.json@g;s/FR038-working-source/FR036-working-source/g' qa/fr038-checks.sh > /tmp/fr036-integrated-checks.sh
bash /tmp/fr036-integrated-checks.sh
FR033_DISPOSABLE_VALIDATION=1 FR034_SOURCE_MANIFEST=qa/fr036-source-sha256.json FR034_PRODUCT_LABEL=FR036-working-source node --experimental-strip-types qa/fr036-browser.mjs
