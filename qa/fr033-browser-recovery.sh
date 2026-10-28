#!/usr/bin/env bash
# Invoke only using app-exec --validate --mode standalone in the app container.
set -euo pipefail
export FR033_DISPOSABLE_VALIDATION=1
source qa/fr033-browser-runtime.sh
export FR033_EVIDENCE_DIR="$FR033_RUNTIME_PREFIX/evidence"
trap 'rm -rf "$FR033_RUNTIME_PREFIX"' EXIT
node -e 'const fs=require("fs");for(const f of ["package.json","package-lock.json"])fs.writeFileSync(f,fs.readFileSync(f,"utf8").replaceAll("file:../../.praetor/sdk/","file:/workspace/.praetor/sdk/"));'
npm ci --no-audit --no-fund > "$FR033_RUNTIME_PREFIX/npm.log" 2>&1 || { cat "$FR033_RUNTIME_PREFIX/npm.log"; exit 1; }
npm install --no-save --package-lock=false --ignore-scripts playwright@1.56.1 --no-audit --no-fund > "$FR033_RUNTIME_PREFIX/playwright.log" 2>&1 || { cat "$FR033_RUNTIME_PREFIX/playwright.log"; exit 1; }
npx playwright install chromium
node qa/fr033-browser-launch.mjs
node qa/fr033-component-browser.mjs
node --experimental-strip-types qa/fr033-integration-browser.mjs
