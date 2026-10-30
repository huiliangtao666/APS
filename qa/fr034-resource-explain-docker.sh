#!/usr/bin/env bash
set -euo pipefail
: "${DEC0203_REPO:?Absolute checkout path}"
: "${DEC0203_OUT:?New empty absolute evidence directory}"
[[ -d "$DEC0203_OUT" && -z $(ls -A "$DEC0203_OUT") ]] || exit 2
mkdir "$DEC0203_OUT/regression" "$DEC0203_OUT/fix"
DEC0203_OUT="$DEC0203_OUT/regression" bash "$DEC0203_REPO/qa/s06-docker.sh"
docker run --rm --init --mount "type=bind,src=$DEC0203_REPO,dst=/input,readonly" --mount "type=bind,src=$DEC0203_OUT/fix,dst=/evidence" aps-fr038-qa-runtime:latest bash -lc '
set -e
cd /workspace/apps/aps-fr032
tar -C /input --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -xf -
node --experimental-strip-types --test qa/fr034-resource-explain.test.mjs qa/task-linkage.test.mjs qa/unknown-endpoints.test.mjs > /evidence/targeted.log 2>&1
npx playwright install chromium --only-shell > /evidence/browser-install.log 2>&1
node --experimental-strip-types qa/fr034-resource-explain-browser.mjs > /evidence/browser.log 2>&1
node --input-type=module -e '"'"'import fs from "node:fs";import {createHash} from "node:crypto";const old=JSON.parse(fs.readFileSync("qa/fr034-source-sha256.json"));const manifest={productSourceSHA:"FR034-RESOURCE-EXPLAIN-01 current disposable source",files:Object.fromEntries(Object.keys(old.files).map(f=>[f,createHash("sha256").update(fs.readFileSync(f)).digest("hex")]))};fs.writeFileSync("qa/fr034-resource-current.json",JSON.stringify(manifest));fs.writeFileSync("/evidence/current-source-manifest.json",JSON.stringify(manifest,null,2));'"'"'
export FR034_PRODUCT_LABEL="FR034-RESOURCE-EXPLAIN-01 current disposable source" FR034_SOURCE_MANIFEST=qa/fr034-resource-current.json FR033_DISPOSABLE_VALIDATION=1
node --experimental-strip-types qa/fr034-keyboard-r1-browser.mjs > /evidence/keyboard.log 2>&1
node --experimental-strip-types qa/fr034-unknown-browser.mjs > /evidence/unknown.log 2>&1
node --experimental-strip-types qa/fr034-history-api.mjs > /evidence/history.log 2>&1
'
