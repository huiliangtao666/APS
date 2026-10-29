#!/usr/bin/env bash
# Isolated application container; never installs dependencies on the VM host.
set -euo pipefail
: "${FR026_REPO:?absolute checkout path}"
: "${FR026_OUT:?absolute new evidence path}"
mkdir -p "$FR026_OUT"
docker run --rm --init --mount "type=bind,src=$FR026_REPO,dst=/input,readonly" --mount "type=bind,src=$FR026_OUT,dst=/evidence" aps-fr038-qa-runtime:latest bash -lc '
set -e
cd /workspace/apps/aps-fr032
tar -C /input --exclude=node_modules --exclude=dist --exclude=.git -cf - . | tar -xf -
node -p "JSON.stringify({node:process.version,platform:process.platform,arch:process.arch})" > /evidence/runtime.json
npm ls --depth=0 > /evidence/dependencies.txt 2>&1 || true
node --experimental-strip-types --test qa/fr026-restore.test.mjs > /evidence/restore-tests.log 2>&1
npm test > /evidence/npm-test.log 2>&1
node --experimental-strip-types --test qa/fr026-restore.test.mjs qa/confirmation.test.mjs qa/progress-impact.test.mjs qa/run-history.test.mjs qa/p08.test.mjs > /evidence/directed-tests.log 2>&1
npm run build > /evidence/build.log 2>&1
node --experimental-strip-types --test qa/worker-build.test.mjs > /evidence/worker-build.log 2>&1
npx esbuild qa/trial-panel.test.tsx --jsx=automatic --bundle --platform=node --packages=external --format=cjs --outfile=.qa-trial-panel.cjs
node --test .qa-trial-panel.cjs > /evidence/react-tests.log 2>&1
npx playwright install chromium --only-shell > /evidence/browser-install.log 2>&1
node --experimental-strip-types qa/fr026-restore-browser.mjs > /evidence/browser.log 2>&1
'
