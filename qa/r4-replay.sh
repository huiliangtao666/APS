#!/usr/bin/env bash
set -euo pipefail
: "${R4_OUT:?absolute isolated R4 evidence directory}"
: "${B234_OUT:?absolute isolated existing-path evidence directory}"
: "${B234_PRODUCT_SHA:?fixed 40-character product SHA}"
mkdir -p "$R4_OUT/route" "$R4_OUT/browser"
bash qa/b234-replay.sh
R4_EVIDENCE="$R4_OUT/route" node --experimental-strip-types --test qa/r4-route.test.mjs > "$R4_OUT/route.log" 2>&1
R4_EVIDENCE="$R4_OUT/browser" B2_PRODUCT_SHA="$B234_PRODUCT_SHA" bash qa/b234-browser-runtime.sh node --experimental-strip-types qa/r4-browser.mjs > "$R4_OUT/browser.log" 2>&1
printf 'PASS fixed-SHA B234 regressions and R4 route/API/application Worker/root React/persistence/native export.\n' > "$R4_OUT/replay.status"
# Independent Python3 checks (no product imports):
# python3 qa/b3-material-oracle.py "$B3_FIXTURE_DIR" "$B234_OUT/b3" "$B234_OUT/browser-b3"
# python3 qa/b234-oracle.py "$B234_INPUTS_DIR" "$B234_OUT/joint" "$B234_OUT/browser-joint"
# python3 qa/r4-source-oracle.py "$R4_OUT/route" "$R4_OUT/browser"
