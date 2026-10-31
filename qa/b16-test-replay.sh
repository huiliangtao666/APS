#!/usr/bin/env bash
set -euo pipefail
export B16_OUT=/tmp/b16-evidence
mkdir -p "$B16_OUT"
trap 'node qa/b16-test-export.mjs' EXIT
node --test src/lib/line-scope.test.mjs qa/b16-test-core.mjs > "$B16_OUT/tests.log" 2>&1 || { tail -100 "$B16_OUT/tests.log"; exit 1; }
node --input-type=module -e 'import fs from "node:fs";import os from "node:os";fs.writeFileSync(process.env.B16_OUT+"/environment.json",JSON.stringify({source:process.env.B16_SOURCE,node:process.version,platform:process.platform,arch:process.arch,cpus:os.cpus().length,command:"bash qa/b16-test-replay.sh",dependencies:"stdlib and unchanged repository modules only; no installation",isolation:"official app-exec --validate standalone disposable source; no service mutated",time:new Date().toISOString()},null,2));'
tail -12 "$B16_OUT/tests.log"
