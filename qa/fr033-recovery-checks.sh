#!/usr/bin/env bash
set -euo pipefail
[[ $PWD == /tmp/praetor-app-validate-*/project && $(id -u) != 0 ]] || exit 2
node -e 'const fs=require("fs");for(const f of ["package.json","package-lock.json"])fs.writeFileSync(f,fs.readFileSync(f,"utf8").replaceAll("file:../../.praetor/sdk/","file:/workspace/.praetor/sdk/"));'
npm ci --no-audit --no-fund > /tmp/fr033-recovery-npm.log 2>&1
check_dir=$(mktemp -d /tmp/fr033-checks-XXXXXX)
trap 'rm -rf "$check_dir"' EXIT
check(){
 printf 'CHECK: %s\n' "$*"
 if "$@" > "$check_dir/check.log" 2>&1; then
  sed -n -E '/^# (tests|pass|fail|Subtest: (HISTORY|ZOOM|WINDOW))/p; /built in/p' "$check_dir/check.log"
  echo 'CHECK_EXIT=0'
 else
  code=$?; tail -100 "$check_dir/check.log"; return "$code"
 fi
}
check npm test
check node --experimental-strip-types --test qa/timetable.test.mjs qa/fr030-independent.test.mjs
check npm run build
npm install --no-save --package-lock=false --ignore-scripts react-test-renderer@18.3.1 --no-audit --no-fund > /tmp/fr033-recovery-renderer.log 2>&1
npx esbuild qa/timeline-panel.test.tsx --jsx=automatic --bundle --platform=node --packages=external --format=cjs --outfile=.qa-timeline-ui.cjs
check node --test .qa-timeline-ui.cjs
FR033_DISPOSABLE_VALIDATION=1 node --experimental-strip-types qa/fr033-integration-runner.mjs --smoke
