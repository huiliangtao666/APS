#!/bin/sh
# Run only within official app-exec --validate; all writes are disposable.
set -eu
available=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)
test "$available" -ge 2097152
mkdir -p node_modules .workbench-evidence .workbench-fixture
cp -a /workspace/apps/aps-b12-pack-batch/node_modules/. ./node_modules/
export NODE_OPTIONS=--max-old-space-size=640
npm run build > .workbench-evidence/build.log 2>&1 || { cat .workbench-evidence/build.log; exit 1; }
node qa/workbench-r2-fixtures.mjs .workbench-fixture > .workbench-evidence/fixture.log 2>&1 || { cat .workbench-evidence/fixture.log; exit 1; }
export WORKBENCH_FIXTURE="$PWD/.workbench-fixture" WORKBENCH_EVIDENCE="$PWD/.workbench-evidence"
NODE_OPTIONS=--max-old-space-size=128 node --test --test-concurrency=1 qa/workbench-r2.test.mjs > .workbench-evidence/contracts.log 2>&1 || { cat .workbench-evidence/contracts.log; exit 1; }
./node_modules/.bin/esbuild qa/workbench-r2-ui.test.tsx --bundle --platform=node --packages=external --format=cjs --outfile=.workbench-evidence/ui.cjs > .workbench-evidence/ui-build.log 2>&1
node --test .workbench-evidence/ui.cjs > .workbench-evidence/ui.log 2>&1 || { cat .workbench-evidence/ui.log; exit 1; }
# Existing in-process parameter contracts, not HTTP or Worker tests.
export PARAMETER_FIXTURE="$WORKBENCH_FIXTURE"
NODE_OPTIONS=--max-old-space-size=128 node --test --test-concurrency=1 qa/parameter-ui-core.test.mjs qa/parameter-ui-routes.test.mjs > .workbench-evidence/impact.log 2>&1 || { cat .workbench-evidence/impact.log; exit 1; }
node qa/workbench-r2-evidence.mjs
