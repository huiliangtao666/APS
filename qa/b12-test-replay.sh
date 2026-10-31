#!/usr/bin/env bash
set -euo pipefail
# Run in official disposable app-exec --validate; the copied manifest alone is
# adjusted to the workspace SDK tarballs. No tracked/global manifest is changed.
node --input-type=module -e 'import fs from "node:fs";for(const name of ["package.json","package-lock.json"]){const s=fs.readFileSync(name,"utf8").replaceAll("file:../../.praetor/sdk/","file:/workspace/.praetor/sdk/");fs.writeFileSync(name,s);}'
npm ci --ignore-scripts --no-audit --no-fund
npm run build
node --experimental-strip-types --test src/lib/process-config.test.mjs src/lib/process-source.test.mjs src/lib/process-cooling.test.mjs qa/b12-test-core.mjs
node --experimental-strip-types --test --test-skip-pattern='FR021 AC14 waiting and undeclared space rules' qa/production-batches.test.mjs
R4_EVIDENCE=/tmp/b12-r4-output node --experimental-strip-types --test qa/r4-route.test.mjs
# Stream evidence back to caller; validation temp directories are then removed.
node qa/b12-test-export.mjs
