#!/usr/bin/env bash
# Execute only in an existing application container, on the fixed source tree.
# Generate the 10KB fixture beforehand with r7-workflow-freeze-fixture.py.
set -euo pipefail
: "${R7_SMALL_FIXTURE:?Set an absolute path to the generated small fixture}"
: "${R7_CORE_OUT:?Set an empty disposable evidence directory}"
export NODE_ENV=test NODE_OPTIONS=--max-old-space-size=64
mkdir -p "$R7_CORE_OUT"
node --experimental-strip-types --test --test-concurrency=1 \
  qa/r7-workflow-freeze-core.test.mjs qa/r7-workflow-freeze-workbook.test.mjs \
  > "$R7_CORE_OUT/core.log" 2>&1
./node_modules/.bin/esbuild qa/r7-workflow-freeze-ui.test.tsx --jsx=automatic \
  --bundle --platform=node --packages=external --loader:.css=empty --format=cjs \
  --outfile="$R7_CORE_OUT/ui.cjs" > "$R7_CORE_OUT/ui-compile.log" 2>&1
NODE_PATH="$PWD/node_modules" node --test "$R7_CORE_OUT/ui.cjs" > "$R7_CORE_OUT/ui.log" 2>&1
# One sequence, one test file at a time. Each fixture closes its own HTTP server
# and only removes its disposable state after preserving evidence originals.
node --experimental-strip-types --test --test-concurrency=1 \
  qa/r7-dev-application.test.mjs qa/confirmation.test.mjs qa/r4-route.test.mjs \
  src/lib/independent-verification.test.mjs > "$R7_CORE_OUT/regression.log" 2>&1
