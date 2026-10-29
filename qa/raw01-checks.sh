#!/usr/bin/env bash
set -euo pipefail
node qa/raw01-check.mjs
mkdir -p /evidence/tests
node --test qa/raw01.test.mjs > /evidence/tests/raw01.log 2>&1
# Reuse every finite FR014/015 and retained FR013/027/035/036/038 gate, with
# this repair's own manifests. Old delivered manifests/evidence stay immutable.
sed 's@qa/fr014015-source-sha256.json@qa/raw01-source-sha256.json@g;s@qa/fr014015-check.mjs@qa/raw01-check.mjs@g;s/FR014015-working-source/RAW01-round1-working-source/g;s@node --experimental-strip-types qa/fr014015-browser.mjs@node --experimental-strip-types qa/.raw01-fr014015-browser.mjs@;s@node qa/fr014015-summary.mjs@node qa/.raw01-fr014015-summary.mjs@' qa/fr014015-checks.sh > /tmp/raw01-integrated-checks.sh
sed 's@qa/fr014015-source-sha256.json@qa/raw01-source-sha256.json@g' qa/fr014015-browser.mjs > qa/.raw01-fr014015-browser.mjs
sed 's@qa/fr014015-source-sha256.json@qa/raw01-source-sha256.json@g;s/c8aeb9283776207853efbdb0c5ea8b3eb09ab039/f00e705572c6f034f3982ca236060fae2750b801/g' qa/fr014015-summary.mjs > qa/.raw01-fr014015-summary.mjs
bash /tmp/raw01-integrated-checks.sh
RAW01_DISPOSABLE_VALIDATION=1 node --experimental-strip-types qa/raw01-replay.mjs
node --experimental-strip-types qa/raw01-browser.mjs
node qa/raw01-check.mjs
node qa/raw01-summary.mjs
