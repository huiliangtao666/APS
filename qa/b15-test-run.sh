#!/bin/sh
set -eu
npm ci --ignore-scripts --no-audit --no-fund
npm run build
export B15_EVIDENCE=.b15-evidence
mkdir -p "$B15_EVIDENCE"
node -e 'require("node:fs").writeFileSync(process.env.B15_EVIDENCE+"/environment.json",JSON.stringify({node:process.version,platform:process.platform,arch:process.arch,source:process.env.B15_PRODUCT_SHA,environment:"disposable application container; no deployment"}))'
node --experimental-strip-types qa/b15-test-baseline-repro.mjs > "$B15_EVIDENCE/baseline-repro.json"
set +e
node --experimental-strip-types --test qa/b15-test-core.test.mjs qa/b15-test-seams.test.mjs src/lib/plan-comparison.test.mjs src/lib/downtime-shift-reason.test.mjs qa/execution-facts.test.mjs qa/simulation-events.test.mjs qa/condition-trials.test.mjs qa/progress-impact.test.mjs > "$B15_EVIDENCE/tests.log" 2>&1
b15_exit_code=$?
set -e
cat "$B15_EVIDENCE/tests.log"
node qa/b15-test-export.mjs
exit "$b15_exit_code"
