#!/usr/bin/env bash
# Run in isolated app container built from the fixed source manifest; no publication.
set -euo pipefail
export R7_EVIDENCE=${R7_EVIDENCE:-/evidence}
mkdir -p "$R7_EVIDENCE"
check(){ local name=$1; shift; "$@" > "$R7_EVIDENCE/$name.log" 2>&1 || { tail -90 "$R7_EVIDENCE/$name.log"; return 1; }; echo "PASS $name"; tail -9 "$R7_EVIDENCE/$name.log"; }
check fr036-original-full-parity node --experimental-strip-types --test qa/fr036-contract.test.mjs
check application-and-domain node --experimental-strip-types --test qa/r7-dev-application.test.mjs qa/r7-test-core.mjs qa/scoped-report.test.mjs qa/confirmation.test.mjs qa/delivery.test.mjs qa/result-assessment.test.mjs qa/b15-dev-seams.test.mjs qa/worker-build.test.mjs src/lib/data-query.test.mjs
check canonical npm test
check frozen-built-worker node --experimental-strip-types qa/r7-test-worker.mjs
for panel in confirmation-panel; do
 check bundle-$panel ./node_modules/.bin/esbuild qa/$panel.test.tsx --jsx=automatic --bundle --platform=node --packages=external --format=cjs --outfile=/tmp/r7-$panel.cjs
 NODE_PATH=$PWD/node_modules check $panel node --test /tmp/r7-$panel.cjs
done
