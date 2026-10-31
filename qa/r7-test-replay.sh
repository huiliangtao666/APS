#!/usr/bin/env bash
set -euo pipefail
node --input-type=module -e 'import fs from "node:fs";for(const name of ["package.json","package-lock.json"]){fs.writeFileSync(name,fs.readFileSync(name,"utf8").replaceAll("file:../../.praetor/sdk/","file:/workspace/.praetor/sdk/"));}'
export R7_EVIDENCE=/tmp/r7-query-evidence
mkdir -p "$R7_EVIDENCE"
npm ci --ignore-scripts --no-audit --no-fund > "$R7_EVIDENCE/install.log" 2>&1
npm run build > "$R7_EVIDENCE/build.log" 2>&1
node --experimental-strip-types --test src/lib/data-query.test.mjs qa/scoped-report.test.mjs qa/confirmation.test.mjs qa/delivery.test.mjs qa/result-assessment.test.mjs qa/fr036-contract.test.mjs qa/r7-test-core.mjs > "$R7_EVIDENCE/tests.log" 2>&1 || { tail -100 "$R7_EVIDENCE/tests.log"; exit 1; }
node --experimental-strip-types qa/r7-test-worker.mjs > "$R7_EVIDENCE/worker.log" 2>&1 || { cat "$R7_EVIDENCE/worker.log"; exit 1; }
node --input-type=module -e 'import fs from "node:fs";import os from "node:os";fs.writeFileSync(process.env.R7_EVIDENCE+"/environment.json",JSON.stringify({source:process.env.R7_SOURCE,node:process.version,platform:process.platform,arch:process.arch,cpus:os.cpus().length,command:"bash qa/r7-test-replay.sh",isolation:"official app-exec --validate disposable source; no deployed service changed",time:new Date().toISOString()},null,2)+"\n");'
node qa/r7-test-export.mjs
