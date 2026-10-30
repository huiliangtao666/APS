#!/usr/bin/env bash
set -euo pipefail
mkdir -p /evidence/tests
check(){
 local name="$1"; shift
 "$@" > "/evidence/tests/$name.log" 2>&1 || { cat "/evidence/tests/$name.log"; return 1; }
 echo "PASS $name"
 tail -9 "/evidence/tests/$name.log"
}
check canonical npm test
check business node --experimental-strip-types --test qa/timetable.test.mjs qa/confirmation.test.mjs qa/production-batches.test.mjs qa/joint-resources.test.mjs qa/delivery.test.mjs qa/result-assessment.test.mjs qa/condition-trials.test.mjs qa/execution-facts.test.mjs qa/progress-impact.test.mjs qa/simulation-events.test.mjs qa/task-linkage.test.mjs qa/resource-load.test.mjs qa/unknown-endpoints.test.mjs
check query npm run test:query-ui
check csv node --experimental-strip-types prototypes/fr013-batch-import/verify.mjs
check build npm run build
check worker node --experimental-strip-types --test qa/worker-build.test.mjs
for component in editor-interaction resource-panel delivery-panel result-panel trial-panel confirmation-panel execution-panel timeline-panel task-linkage-panel load-panel; do
 check "bundle-$component" npx esbuild "qa/$component.test.tsx" --jsx=automatic --bundle --platform=node --packages=external --format=cjs --outfile=".qa-$component.cjs"
 check "$component" node --test ".qa-$component.cjs"
done

check scoped-report node --experimental-strip-types --test qa/scoped-report.test.mjs
FR033_DISPOSABLE_VALIDATION=1 FR034_SOURCE_MANIFEST=qa/fr035-source-sha256.json FR034_PRODUCT_LABEL=FR035-working-source node --experimental-strip-types qa/fr035-browser.mjs
node --experimental-strip-types qa/fr035-history-api.mjs
