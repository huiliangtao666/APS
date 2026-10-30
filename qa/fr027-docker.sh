#!/usr/bin/env bash
# Disposable cached runtime only. No production mount, install, app binding or publication.
set -euo pipefail
: "${FR027_REPO:?Absolute checkout path}"
: "${FR027_OUT:?New empty absolute evidence directory}"
[[ -d "$FR027_OUT" && -z $(ls -A "$FR027_OUT") ]] || exit 2
docker run --rm --init --user root --mount "type=bind,src=$FR027_REPO,dst=/input,readonly" --mount "type=bind,src=$FR027_OUT,dst=/evidence" aps-fr038-qa-runtime:latest bash -lc '
 cd /workspace/apps/aps-fr032 && tar -C /input --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -xf - && npx playwright install chromium --only-shell && bash qa/fr027-checks.sh'
