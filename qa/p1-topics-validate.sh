#!/bin/sh
# Only in an official disposable validation copy; no persistent service or port.
set -eu
mkdir -p .p1-evidence
NODE_OPTIONS=--max-old-space-size=512 npm run build > .p1-evidence/build.log 2>&1 || { tail -50 .p1-evidence/build.log; exit 1; }
P1_OUT=.p1-evidence/cases node --experimental-strip-types --test --test-concurrency=1 qa/p1-topics-contract.test.mjs qa/p1-topics-domain.test.mjs qa/p1-topics-application.test.mjs > .p1-evidence/application.log 2>&1 || { tail -90 .p1-evidence/application.log; exit 1; }
node_modules/.bin/esbuild qa/p1-topics-ui.test.tsx --jsx=automatic --bundle --platform=node --packages=external --format=cjs --outfile=.p1-ui-check.cjs > .p1-evidence/ui-build.log 2>&1
node --test .p1-ui-check.cjs > .p1-evidence/ui.log 2>&1 || { tail -50 .p1-evidence/ui.log; exit 1; }
node --experimental-strip-types --test --test-concurrency=1 src/lib/orders.test.mjs src/lib/line-scope.test.mjs src/lib/data-query.test.mjs src/lib/independent-verification.test.mjs src/lib/plan-comparison.test.mjs qa/b16-application.test.mjs qa/confirmation.test.mjs > .p1-evidence/impact.log 2>&1 || { tail -70 .p1-evidence/impact.log; exit 1; }
node --experimental-strip-types qa/p1-topics-sample.mjs .p1-evidence/sample
node qa/p1-topics-evidence.mjs
