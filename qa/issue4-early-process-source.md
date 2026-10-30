# Issue4 / FR016 early process source replay

Authorized baseline: v0.3 FR016, applicable AC02/03, confirmed G01 SOURCE r1 §§2/6/8.
Parent: 723fea514931a05ddb276bda4d0842cb9d90d255. No P29 repair round is reopened.

Run in an isolated Linux application container, never install or start Node on the VM host.
Use Node 22, package dependencies from package-lock.json, Playwright and Chromium with its OS libraries.
The recorded runtime is aps-fr038-qa-runtime:latest with Chromium at
/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome. This is a QA synthetic identity fixture, not real platform SSO.

Mount writable evidence at /evidence. Extract the parent's src/lib/process-config.mjs to
/evidence/baseline/process-config.mjs (git show 723fea514931a05ddb276bda4d0842cb9d90d255:src/lib/process-config.mjs).
From the isolated copy of this checkout:

```
npm run build
npm test
node --experimental-strip-types --test qa/issue4-g01.test.mjs qa/issue4-u1.test.mjs qa/issue4-u2.test.mjs qa/issue4-u3.test.mjs qa/issue4-u3-remaining.test.mjs
node --experimental-strip-types qa/issue4-early-process-source.mjs
```

The browser test performs real React edits and rejected saves: MIX duplicated to three occurrences plus a second FILL duplicate group; MIX/FILL cycle; ABSENT predecessor. It selects and queries every member, reopens to the first member, refreshes data and reopens, checks candidate hashes and whole-store zero writes, rejects current editing, distinguishes a trial candidate, checks role/stale guards, accepts a legal change and checks saved plan/input history unchanged. Parent comparison retains the same codes/messages and number of findings. Boundary library cases exclude cycle tails and discarded duplicate graph entries.

The rejected proposal is returned as a read-only response snapshot; no run, plan, inputVersion or operations record is written. “Refresh” here means the app's refresh-data action in the same page session. A full browser reload intentionally requires resubmitting the check; persisted failed-precheck history is outside authorization. Old unproven history is not backfilled. Early INPUT / ROUTE_* findings do not establish late P28 planner reachability.
