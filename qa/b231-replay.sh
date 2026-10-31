#!/usr/bin/env bash
set -euo pipefail
: "${B231_REPO:?absolute fixed clean checkout}"
: "${B231_INPUTS:?absolute original UAT03/04/06/07/08 directory}"
: "${B231_B1_INPUTS:?absolute original UAT01/02 directory}"
: "${B231_OUT:?absolute new evidence directory}"
B231_IMAGE="${B231_IMAGE:-aps-uat-r21-replay:c1}"
mkdir -p "$B231_OUT"
git -C "$B231_REPO" rev-parse HEAD > "$B231_OUT/source-sha.txt"
git -C "$B231_REPO" show -s --format='%H %P' HEAD > "$B231_OUT/source-parent.txt"
git -C "$B231_REPO" status --porcelain > "$B231_OUT/source-dirty.txt"
[[ ! -s "$B231_OUT/source-dirty.txt" ]] || { echo 'Use a clean fixed-SHA checkout'; exit 2; }
docker image inspect "$B231_IMAGE" --format '{{json .}}' > "$B231_OUT/runtime-image.json"
docker run --rm --init --network none \
 --mount "type=bind,src=$B231_REPO,dst=/input,readonly" \
 --mount "type=bind,src=$B231_INPUTS,dst=/b2-inputs,readonly" \
 --mount "type=bind,src=$B231_B1_INPUTS,dst=/b1-inputs,readonly" \
 --mount "type=bind,src=$B231_OUT,dst=/evidence" "$B231_IMAGE" bash -lc '
set -euo pipefail
cd /workspace/apps/app
find src server qa public -type f -delete
tar -C /input --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -xf -
node --version > /evidence/node-version.txt
node --input-type=module -e '\''import fs from "node:fs";import{createHash}from"node:crypto";const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p+"/"+e.name):[p+"/"+e.name]);fs.writeFileSync("/evidence/runtime-source-hashes.json",JSON.stringify(Object.fromEntries(["src","server","qa"].flatMap(walk).map(p=>[p,createHash("sha256").update(fs.readFileSync(p)).digest("hex")]))));'\''
npm run build > /evidence/build.log 2>&1
npm test > /evidence/npm-test.log 2>&1
B2_INPUTS=/b2-inputs B2_EVIDENCE=/evidence node --experimental-strip-types --test qa/b231-intake.test.mjs > /evidence/intake.log 2>&1
node --experimental-strip-types --test qa/fr013-config.test.mjs qa/fr013-multisource.test.mjs qa/fr006-csv9-explicit.test.mjs > /evidence/mapping-regression.log 2>&1
B2_INPUTS=/b2-inputs B2_EVIDENCE=/evidence node --experimental-strip-types --test --test-name-pattern="canonical resource CSV|atomic invalid" qa/b2-integrated.test.mjs > /evidence/b2-impacted.log 2>&1
B1_INPUT_DIR=/b1-inputs EVIDENCE_DIR=/evidence node --experimental-strip-types --test qa/b1-integration.test.mjs > /evidence/b1-api.log 2>&1
B1_INPUT_DIR=/b1-inputs EVIDENCE_DIR=/evidence/b1-browser node --experimental-strip-types qa/b1-browser.mjs > /evidence/b1-browser.log 2>&1
B2_INPUTS=/b2-inputs B2_EVIDENCE=/evidence node --experimental-strip-types qa/b231-browser.mjs > /evidence/browser.log 2>&1
printf "PASS\n" > /evidence/replay.status
'
