#!/usr/bin/env bash
set -euo pipefail
: "${RAW01_REPO:?Absolute source checkout}"
: "${RAW01_OUT:?New empty absolute evidence directory}"
[[ -d "$RAW01_OUT" && -z $(ls -A "$RAW01_OUT") ]] || exit 2
cache=()
if [[ -n "${RAW01_BROWSER_CACHE:-}" ]]; then
 [[ -d "$RAW01_BROWSER_CACHE" ]] || exit 2
 cache=(--mount "type=bind,src=$RAW01_BROWSER_CACHE,dst=/root/.cache/ms-playwright")
fi
docker run --rm --init --user root "${cache[@]}" --mount "type=bind,src=$RAW01_REPO,dst=/input,readonly" --mount "type=bind,src=$RAW01_OUT,dst=/evidence" aps-fr038-qa-runtime:latest bash -lc '
 cd /workspace/apps/aps-fr032 && tar -C /input --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -xf - && node --version > /evidence/node-version.txt && npx playwright install chromium --only-shell && bash qa/raw01-checks.sh'
