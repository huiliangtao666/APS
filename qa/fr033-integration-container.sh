#!/usr/bin/env bash
# Finite check; invoke via app-exec.sh --validate --mode standalone only.
set -euo pipefail
if [[ ${1:---smoke} == --browser ]]; then
 exec bash qa/fr033-browser-recovery.sh
fi
node -e 'const fs=require("fs");for(const f of ["package.json","package-lock.json"])fs.writeFileSync(f,fs.readFileSync(f,"utf8").replaceAll("file:../../.praetor/sdk/","file:/workspace/.praetor/sdk/"));'
npm ci > /tmp/fr033-integration-npm.log 2>&1 || { cat /tmp/fr033-integration-npm.log; exit 1; }
export FR033_DISPOSABLE_VALIDATION=1
case "${1:---smoke}" in
 --smoke) node --experimental-strip-types qa/fr033-integration-runner.mjs --smoke ;;
 *) echo 'Use --smoke or --browser' >&2; exit 2 ;;
esac
