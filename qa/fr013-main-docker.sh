#!/usr/bin/env bash
# Isolated copied source/dependencies/business data only; no live app or publication.
set -euo pipefail
: "${FR013_REPO:?Absolute source checkout}"
: "${FR013_OUT:?New empty absolute evidence directory}"
[[ -d "$FR013_OUT" && -z $(ls -A "$FR013_OUT") ]] || exit 2
docker run --rm --init --user root --mount "type=bind,src=$FR013_REPO,dst=/input,readonly" --mount "type=bind,src=$FR013_OUT,dst=/evidence" aps-fr038-qa-runtime:latest bash -lc '
 cd /workspace/apps/aps-fr032 && tar -C /input --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -xf - && npx playwright install chromium --only-shell && bash qa/fr013-main-checks.sh'
