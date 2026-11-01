#!/bin/sh
# Invoke only in a disposable official app validation copy with dependencies.
set -eu
mkdir -p .b16-evidence
NODE_OPTIONS=--max-old-space-size=512 npm run build > .b16-evidence/build.log 2>&1 || { cat .b16-evidence/build.log; exit 1; }
B16_APP_OUT=.b16-evidence/app node --experimental-strip-types --test --test-concurrency=1 qa/b16-application.test.mjs > .b16-evidence/application.log 2>&1 || { cat .b16-evidence/application.log; exit 1; }
node_modules/.bin/esbuild qa/b16-application-ui.test.tsx --jsx=automatic --bundle --platform=node --packages=external --format=cjs --outfile=.b16-ui-check.cjs > .b16-evidence/ui-build.log 2>&1 || { cat .b16-evidence/ui-build.log; exit 1; }
node --test .b16-ui-check.cjs > .b16-evidence/ui.log 2>&1 || { cat .b16-evidence/ui.log; exit 1; }
node --experimental-strip-types --test --test-concurrency=1 src/lib/line-scope.test.mjs src/lib/independent-verification.test.mjs src/lib/data-query.test.mjs src/lib/plan-comparison.test.mjs qa/fr013-config.test.mjs qa/issue6-calendar.test.mjs qa/r4-route.test.mjs qa/pack-batch.test.mjs qa/scoped-report.test.mjs > .b16-evidence/impact.log 2>&1 || { cat .b16-evidence/impact.log; exit 1; }
node --experimental-strip-types qa/b16-application-sample.mjs .b16-evidence/sample > .b16-evidence/sample.log || { cat .b16-evidence/sample.log; exit 1; }
node qa/b15-user-preview-selftest.mjs --incremental > .b16-evidence/node-recovery.log 2>&1 || { cat .b16-evidence/node-recovery.log; exit 1; }
