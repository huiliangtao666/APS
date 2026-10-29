#!/usr/bin/env bash
set -euo pipefail
: "${FR014015_REPO:?Absolute source checkout}"
: "${FR014015_OUT:?New empty absolute evidence directory}"
[[ -d "$FR014015_OUT" && -z $(ls -A "$FR014015_OUT") ]] || exit 2
cache=()
if [[ -n "${FR014015_BROWSER_CACHE:-}" ]]; then
 [[ -d "$FR014015_BROWSER_CACHE" ]] || exit 2
 cache=(--mount "type=bind,src=$FR014015_BROWSER_CACHE,dst=/root/.cache/ms-playwright")
fi
docker run --rm --init --user root "${cache[@]}" --mount "type=bind,src=$FR014015_REPO,dst=/input,readonly" --mount "type=bind,src=$FR014015_OUT,dst=/evidence" aps-fr038-qa-runtime:latest bash -lc '
 cd /workspace/apps/aps-fr032 && tar -C /input --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -xf - && node --version > /evidence/node-version.txt && npx playwright install chromium --only-shell && bash qa/fr014015-checks.sh'
