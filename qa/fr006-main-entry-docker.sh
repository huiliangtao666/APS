#!/usr/bin/env bash
# Disposable QA runtime: read-only committed root source, temporary business state.
set -euo pipefail
: "${FR006_REPO:?Absolute GitHub checkout path}"
: "${FR006_OUT:?New EMPTY absolute evidence directory}"
[[ -d "$FR006_OUT" && -z $(ls -A "$FR006_OUT") ]] || exit 2
image="${FR006_QA_IMAGE:-aps-fr038-qa-runtime:latest}"
git -C "$FR006_REPO" rev-parse HEAD > "$FR006_OUT/source-sha.txt"
git -C "$FR006_REPO" status --porcelain > "$FR006_OUT/source-status.txt"
[[ ! -s "$FR006_OUT/source-status.txt" ]] || { echo 'Commit source before collecting final evidence'; exit 2; }
docker image inspect "$image" --format '{{.Id}}' > "$FR006_OUT/qa-image-id.txt"
docker run --rm --init --user root --mount "type=bind,src=$FR006_REPO,dst=/input,readonly" --mount "type=bind,src=$FR006_OUT,dst=/evidence" "$image" bash -lc '
set -e
cd /workspace/apps/aps-fr032
tar -C /input --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -xf -
# Bind copied source/fixtures to the collection, independently of built artifacts.
node --input-type=module - <<"JS"
import fs from "node:fs";
import {createHash} from "node:crypto";
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(dir+"/"+e.name):e.isFile()?[dir+"/"+e.name]:[]);}
const files=["src","server","qa"].flatMap(walk).sort();
fs.writeFileSync("/evidence/source-files-sha256.json",JSON.stringify(Object.fromEntries(files.map(p=>[p,createHash("sha256").update(fs.readFileSync(p)).digest("hex")])),null,2));
JS
npm run build > /evidence/build.log 2>&1
npm test > /evidence/npm-test.log 2>&1
node --experimental-strip-types --test qa/fr006-main-entry.test.mjs qa/dec0203.test.mjs qa/dec0203-repair-r1.test.mjs > /evidence/targeted.log 2>&1
npx playwright install chromium --only-shell > /evidence/browser-install.log 2>&1
node --experimental-strip-types qa/fr006-main-entry-browser.mjs > /evidence/browser.log 2>&1
'
