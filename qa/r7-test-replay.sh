#!/usr/bin/env bash
set -euo pipefail
node --input-type=module -e 'import fs from "node:fs";for(const name of ["package.json","package-lock.json"]){fs.writeFileSync(name,fs.readFileSync(name,"utf8").replaceAll("file:../../.praetor/sdk/","file:/workspace/.praetor/sdk/"));}'
export R7_EVIDENCE=/tmp/r7-query-evidence
mkdir -p "$R7_EVIDENCE"
trap 'code=$?; if [ "$code" -ne 0 ]; then for f in "$R7_EVIDENCE"/*.log; do echo "$f"; tail -60 "$f"; done; node qa/r7-test-export.mjs; fi' EXIT
echo "R7 phase install"
if [ -n "${R7_DEPENDENCY_CACHE:-}" ]; then
 cp -a "$R7_DEPENDENCY_CACHE" ./node_modules
 node --input-type=module -e 'import fs from "node:fs";import{createHash}from"node:crypto";const lock=JSON.parse(fs.readFileSync("package-lock.json"));const rows=[];for(const[name,spec]of Object.entries({...JSON.parse(fs.readFileSync("package.json")).dependencies,...JSON.parse(fs.readFileSync("package.json")).devDependencies})){const p=JSON.parse(fs.readFileSync("node_modules/"+name+"/package.json"));const expected=lock.packages["node_modules/"+name]?.version;if(!name.startsWith("@praetor/")&&p.version!==expected)throw Error(name+" cache version mismatch "+p.version+" != "+expected);rows.push({name,version:p.version,expected});}fs.writeFileSync(process.env.R7_EVIDENCE+"/dependency-cache.json",JSON.stringify({cache:process.env.R7_DEPENDENCY_CACHE,lockSha256:createHash("sha256").update(fs.readFileSync("package-lock.json")).digest("hex"),rows},null,2)+"\n");' > "$R7_EVIDENCE/install.log" 2>&1
else
 npm ci --ignore-scripts --no-audit --no-fund > "$R7_EVIDENCE/install.log" 2>&1
fi
echo "R7 phase build"
npm run build > "$R7_EVIDENCE/build.log" 2>&1
echo "R7 phase tests"
node --experimental-strip-types --test src/lib/data-query.test.mjs qa/scoped-report.test.mjs qa/confirmation.test.mjs qa/delivery.test.mjs qa/result-assessment.test.mjs qa/r7-test-core.mjs > "$R7_EVIDENCE/tests.log" 2>&1 || { tail -100 "$R7_EVIDENCE/tests.log"; exit 1; }
# Existing static documentation parity drift is retained as a separate result;
# the new current contract adapter tests every actual defs/recordKeys row.
set +e
node --experimental-strip-types --test qa/fr036-contract.test.mjs > "$R7_EVIDENCE/legacy-contract.log" 2>&1
legacy_code=$?
set -e
node --input-type=module -e 'import fs from "node:fs";const s=fs.readFileSync(process.env.R7_EVIDENCE+"/legacy-contract.log","utf8");if(!s.includes("# fail 1")||!s.includes("36 !== 38"))throw Error("unexpected FR036 regression");'
[ "$legacy_code" -eq 1 ]
node --experimental-strip-types qa/r7-test-worker.mjs > "$R7_EVIDENCE/worker.log" 2>&1 || { cat "$R7_EVIDENCE/worker.log"; exit 1; }
node --input-type=module -e 'import fs from "node:fs";import os from "node:os";fs.writeFileSync(process.env.R7_EVIDENCE+"/environment.json",JSON.stringify({source:process.env.R7_SOURCE,node:process.version,platform:process.platform,arch:process.arch,cpus:os.cpus().length,command:"bash qa/r7-test-replay.sh",isolation:"official app-exec --validate disposable source; no deployed service changed",time:new Date().toISOString()},null,2)+"\n");'
node qa/r7-test-export.mjs
