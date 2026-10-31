# UAT04 AC07/17 task selftest

Product source: `96a9dae3ff13d3254c091567fa57cad5d8f37279`, parent `0c9a527fe84523665b26f3ea00aab2f90a0e875f`, source base `be88f073b4c2597abcd3e5533e92f7f94a89ad59`.
Dispatch: `b2:uat04:ac07-17-selftest:96a9dae:20261031:r1`.
Result event: `dlv_30216631-d763-4f1a-a426-dda771fab413:r1`.

Only QA files are added. No application/planner/import/shared source edits. Tests use the existing root React, Express business routes, actual calculation Worker, and isolated JSON stores. Actors are explicitly synthetic planner/supervisor/query, never customer SSO. No persistent endpoint is created; APS-Dev separately owns the PM-dispatched QA environment.

Authority is APS-BL-001 v0.3 UAT04/AC07/17 plus effective CR-DEC02-03 and Issue3. Source originals are the UAT04 nineteen CSV files in the supplied INPUTS; original06 supplies LP01 capacity1 and comprehensive operator skill. Original12 supplies four demands1; original10/11 supply two operations per order and durations30; original17 supplies A240/B240kg. Original05,02,03,04 constrain tools/machines/calendars. Required schema adoption choices (no split/formal/valid, QA whole shift, physical pool mapping, full participation and release, CR parameter adoption) are explicit replaceable simulation supplements. No inferred customer defaults.

`uat04-selftest.mjs` executes eight API/Worker cases: core, demand2/capacity1, wrong skill, wrong required shift, availability beginning60, both explicit H-P04 orders with pre5/post10, and post-window rejection at35. The Python oracle reads original CSV independently and reconstructs task/demand intervals; it accepts any complete legal order, checks unique pool/group cap, source machine, precedence, duration, calendar/downtime, tools, complete coverage, native CSV and source hashes. It accepts an alternative legal order and rejects six core mutations plus H-P04 ledger truncation.

`uat04-browser.mjs` performs actual original19+supplement UI import, resource preview/run, source linkage, save/reload/reopen, browser-native downloads, history preservation, permission/invalid/stale zero-write rejections and AC17. AC17 deliberately injects an illegal *copy* into the disposable store, then uses real independent verification and UI problem/task/frozen-input/return controls. The illegal copy is not a Worker outcome or product FAIL.

Recorded execution: the first browser phase completed seven assertions; its later diagnostic request correctly returned409 stale_input because the test had changed current calendar first. `uat04-diagnostic.mjs` resumed only the uncompleted AC17 assertion in a new matching original04 fixture. No completed UI assertions or unrelated scenarios were rerun. Both original output and resume remain in evidence. The full replay script now performs the diagnostic before changing the live calendar. This reorder is a QA harness correction only; final replay harness is committed after execution, and is not represented as a second full browser run.

Run from a fresh isolated checkout in the **application container**, through official app-exec standalone. Never install/run the application on the VM host. Set `B2_INPUTS` to the extracted raw-b2 parent and `UAT04_OUT` to a fresh QA output directory. Install the lockfile and the two supplied platform SDK tarballs, Playwright1.56.1 and Chromium in the isolated app project, then:

```
npm run build
UAT04_OUT="$UAT04_ROOT/api" node --experimental-strip-types qa/uat04-selftest.mjs
UAT04_OUT="$UAT04_ROOT/ui" bash qa/b234-browser-runtime.sh node --experimental-strip-types qa/uat04-browser.mjs
python3 qa/uat04-oracle.py "$B2_INPUTS/UAT-04" "$UAT04_ROOT"
```

The platform rootless browser wrapper extracts libraries into private temporary storage and removes them on exit. The environment recorder takes `UAT04_OUT` pointing to the parent evidence folder containing source-manifest.json; it verifies all2034 fixed-product source files and emits production/UI build fingerprints. The actual browser output assets match the supplemental build asset names; no persistent QA endpoint is claimed.

QA UAT04 requires PM to check this result and the separately assigned APS-Dev environment, then decide entry and dispatch QA. Whole FR/Issue/CR completion, site facts, UAT03 at833b3d5, UAT05+ and publication retain their own boundaries. New product FAIL0, repair-round increment0.
