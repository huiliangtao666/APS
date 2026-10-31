#!/usr/bin/env bash
set -euo pipefail
: "${HP04_FINAL:?absolute fresh output directory}"
: "${B234_PRODUCT_SHA:?fixed40 product SHA}"
: "${B2_INPUTS:?untouched B2 originals}"
: "${B4_INPUTS:?untouched B4 originals}"
: "${B234_RAW_B3:?untouched B3 originals}"
mkdir -p "$HP04_FINAL/new" "$HP04_FINAL/browser"
export B234_OUT="$HP04_FINAL/existing" R4_OUT="$HP04_FINAL/r4"
# Existing B234 and R4 includes build/core/API/Worker/UI, raw original negative,
# source-derived positive software data, process restart and native CSV downloads.
bash qa/r4-replay.sh
HP04_OUT="$HP04_FINAL/new" node --experimental-strip-types --test qa/hp04.test.mjs qa/n06.test.mjs qa/hp04-n06-integration.test.mjs > "$HP04_FINAL/new.log" 2>&1
HP04_OUT="$HP04_FINAL/browser" B2_PRODUCT_SHA="$B234_PRODUCT_SHA" bash qa/b234-browser-runtime.sh node --experimental-strip-types qa/hp04-n06-browser.mjs > "$HP04_FINAL/browser.log" 2>&1
printf 'PASS fixed-SHA H-P04/N06 explicit mock configuration and B234/R4 regression. No QA UAT conclusion.\n' > "$HP04_FINAL/replay.status"
