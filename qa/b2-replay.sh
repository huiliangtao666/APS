#!/usr/bin/env bash
# VM host orchestrates; Node, build, app and browser execute only inside the isolated container.
set -euo pipefail
: "${B2_REPO:?absolute checkout path}"
: "${B2_INPUTS:?absolute directory containing UAT-03/04/06/07/08 originals}"
: "${B2_OUT:?absolute new evidence directory}"
B2_IMAGE="${B2_IMAGE:-aps-uat-r21-replay:c1}"
mkdir -p "$B2_OUT"
docker image inspect "$B2_IMAGE" --format '{{json .}}' > "$B2_OUT/runtime-image.json"
git -C "$B2_REPO" rev-parse HEAD > "$B2_OUT/source-sha.txt"
git -C "$B2_REPO" status --porcelain > "$B2_OUT/source-dirty.txt"
[[ ! -s "$B2_OUT/source-dirty.txt" ]] || { echo 'Use a clean fixed-SHA checkout'; exit 2; }
docker run --rm --init --network none \
 --mount "type=bind,src=$B2_REPO,dst=/input,readonly" \
 --mount "type=bind,src=$B2_INPUTS,dst=/b2-inputs,readonly" \
 --mount "type=bind,src=$B2_OUT,dst=/evidence" "$B2_IMAGE" bash -lc '
set -euo pipefail
cd /workspace/apps/app
find src server qa public -type f -delete
tar -C /input --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -xf -
node --version > /evidence/node-version.txt
node --input-type=module -e '\''import fs from "node:fs";import{createHash}from"node:crypto";const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p+"/"+e.name):[p+"/"+e.name]);fs.writeFileSync("/evidence/runtime-source-hashes.json",JSON.stringify(Object.fromEntries(["src","server","qa"].flatMap(walk).map(p=>[p,createHash("sha256").update(fs.readFileSync(p)).digest("hex")]))));'\''
npm run build > /evidence/build.log 2>&1
npm test > /evidence/npm-test.log 2>&1
B2_INPUTS=/b2-inputs B2_EVIDENCE=/evidence node --experimental-strip-types --test qa/b2-integrated.test.mjs > /evidence/targeted.log 2>&1
node --experimental-strip-types --test qa/p10-core.test.mjs qa/p10-explicit.test.mjs qa/joint-resources.test.mjs qa/uat-r21-integration.test.mjs qa/fr006-csv9-explicit.test.mjs > /evidence/regression.log 2>&1
B2_INPUTS=/b2-inputs B2_EVIDENCE=/evidence node --experimental-strip-types qa/b2-browser.mjs > /evidence/browser.log 2>&1
printf "PASS\n" > /evidence/replay.status
'
