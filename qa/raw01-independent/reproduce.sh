#!/usr/bin/env bash
# Extract archive here or override FR013_EVIDENCE; run from APS-Test root.
# Default: focused failure reproduction only. Pass "all" for full delivery replay + independent probes.
set -euo pipefail
FR013_EVIDENCE="${FR013_EVIDENCE:-$PWD/temp/fr013-main-evidence}"
FR013_REPO="${FR013_REPO:-$PWD/temp/fr013-main-independent}"
git -C "$FR013_REPO" rev-parse HEAD
test "$(git -C "$FR013_REPO" rev-parse HEAD)" = c8aeb9283776207853efbdb0c5ea8b3eb09ab039
if [[ "${1:-raw01}" == all ]]; then
 FR013_OUT="$FR013_EVIDENCE/replay-$(date +%Y%m%d-%H%M%S)"
 mkdir "$FR013_OUT"
 FR013_REPO="$FR013_REPO" FR013_OUT="$FR013_OUT" bash "$FR013_REPO/qa/fr013-main-docker.sh"
fi
docker run --rm --init --user root \
 --mount "type=bind,src=$FR013_REPO,dst=/input,readonly" \
 --mount "type=bind,src=$FR013_EVIDENCE,dst=/evidence" \
 -e FR013_PROBE_MODE="${1:-raw01}" aps-fr038-qa-runtime:latest bash -lc '
 cd /workspace/apps/aps-fr032
 tar -C /input --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -xf -
 npx playwright install chromium --only-shell
 node qa/fr013-main-check.mjs
 if [[ "$FR013_PROBE_MODE" == all ]]; then
  cp /evidence/independent.mjs qa/test-independent.mjs
  node --experimental-strip-types qa/test-independent.mjs
  cp /evidence/guards.mjs qa/test-independent-guards.mjs
  node --experimental-strip-types qa/test-independent-guards.mjs
 fi
 cp /evidence/raw01-repro.mjs qa/test-raw01-repro.mjs
 node --experimental-strip-types qa/test-raw01-repro.mjs
 node qa/fr013-main-check.mjs'
