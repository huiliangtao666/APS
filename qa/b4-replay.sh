#!/usr/bin/env bash
set -euo pipefail
: "${B4_REPO:?absolute checkout}"
: "${B4_INPUTS:?absolute extracted UAT12/13/14/17 original directory}"
: "${B4_OUT:?absolute evidence directory}"
B4_IMAGE="${B4_IMAGE:-aps-uat-r21-replay:c1}"
mkdir -p "$B4_OUT"
git -C "$B4_REPO" show -s --format='%H %P' HEAD > "$B4_OUT/source-parent.txt"
git -C "$B4_REPO" status --porcelain > "$B4_OUT/source-dirty.txt"
if [[ -s "$B4_OUT/source-dirty.txt" && "${B4_DEV:-0}" != 1 ]]; then echo 'Require clean fixed SHA'; exit 2; fi
docker image inspect "$B4_IMAGE" --format '{{json .}}' > "$B4_OUT/runtime-image.json"
docker run --rm --init --network none \
 --mount "type=bind,src=$B4_REPO,dst=/input,readonly" \
 --mount "type=bind,src=$B4_INPUTS,dst=/b4-inputs,readonly" \
 --mount "type=bind,src=$B4_OUT,dst=/evidence" "$B4_IMAGE" bash -lc '
set -euo pipefail
cd /workspace/apps/app
find src server qa public -type f -delete
tar -C /input --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -xf -
export B4_INPUTS=/b4-inputs B4_EVIDENCE=/evidence
node --version > /evidence/node-version.txt
node --input-type=module -e '\''import fs from "node:fs";import{createHash}from"node:crypto";const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(p+"/"+e.name):[p+"/"+e.name]);fs.writeFileSync("/evidence/runtime-source-hashes.json",JSON.stringify(Object.fromEntries(["src","server","qa"].flatMap(walk).map(p=>[p,createHash("sha256").update(fs.readFileSync(p)).digest("hex")]))));'\''
node --test src/lib/process-cooling.test.mjs > /evidence/b4-unit.log 2>&1
env -u B4_INPUTS -u B4_EVIDENCE node --test src/lib/process-cooling.test.mjs > /evidence/b4-standalone-unit.log 2>&1
node --experimental-strip-types --test qa/b4-admission.test.mjs > /evidence/b4-admission.log 2>&1
npm run build > /evidence/build.log 2>&1
npm test > /evidence/npm-test.log 2>&1
printf "PASS\n" > /evidence/replay.status
'
