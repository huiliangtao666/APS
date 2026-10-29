#!/bin/bash
set -euo pipefail
npm test
npm run build
node --experimental-strip-types --test qa/issue9.test.mjs qa/confirmation.test.mjs qa/execution-facts.test.mjs qa/worker-build.test.mjs qa/condition-trials.test.mjs
node --experimental-strip-types prototypes/fr013-batch-import/verify.mjs
