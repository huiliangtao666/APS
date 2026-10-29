#!/usr/bin/env bash
# Existing authorized QA image caches Node22/dependencies/Chromium; source and all writes isolated.
set -euo pipefail
: "${FR036_REPO:?Absolute source directory}"
: "${FR036_OUT:?New empty absolute evidence directory}"
[[ -d "$FR036_OUT" && -z $(ls -A "$FR036_OUT") ]] || exit 2
docker run --rm --init --user root --mount "type=bind,src=$FR036_REPO,dst=/input,readonly" --mount "type=bind,src=$FR036_OUT,dst=/evidence" aps-fr038-qa-runtime:latest bash -lc '
 cd /workspace/apps/aps-fr032 && tar -C /input --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -xf - && npx playwright install chromium --only-shell && bash qa/fr036-checks.sh'
