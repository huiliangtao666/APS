# UAT07 joint development support

Result event `dlv_a1ccdb55-d45a-428e-bb9c-a4dfd93fcae3:r1`.
One development/selftest package Issue34, not per-FR acceptance tasks. Latest user reaffirmed APS-Test and Dev share implementation and selftest. Product file src/lib/resource-workbench.mjs is owned here (coordinated on Issue34): expose independent-checker findings in the resource workspace with deduplication, retaining source/task references. Four focused regressions and production build pass.
Base product `96a9dae3ff13d3254c091567fa57cad5d8f37279`, parent `0c9a527fe84523665b26f3ea00aab2f90a0e875f`.

The source UAT07 original05 G01 capacity1, T01 capacity3; original12 A/FILL G01 quantity1 and late10, B/FILL quantity1 late0. Original04 prevents MIX02 before15. All four tasks must be covered. Core A-FILL[30,60), G01[30,70), B-FILL[70,100); another complete legal schedule is accepted. A return at70 allows another acquisition at70, not69.

Original19 CSV remain byte-identical. Separate, replaceable software simulation supplies original17's missing split/type/status values, kg normalization, supported CR resource parameters, runtime applicability/quantity/window fields, and explicit original05-to-runtime mappings. No implicit customer defaults. LABOR/MATERIAL and other disabled rules remain disabled. BOM/raw19 are retained with honest deferred scope, not invented active material checks. No real customer account or ledger is required for this authorized configuration stage.

`uat07-bundle-fixture.mjs` implements a source-preserving replay input adapter with explicit supplement provenance. `uat07-bundle-api.mjs` drives the actual Express API and asynchronous calculation Worker, plus capacity/return/acquisition/calendar/shortage/horizon and atomic invalid/permission guards. `uat07-bundle-browser.mjs` drives the real React UI, original19 preview, per-row supplementation and explicit mapping import, input queries, Worker, raw12 task source, frozen inputs, native export, restart, and a deliberately illegal diagnostic copy using the SAME configuration. Illegal diagnostic copies are not scheduler defects. `uat07-bundle-diagnostics.mjs` checks60/69 rejection and70 acceptance in the product checker. `uat07-bundle-oracle.py` imports no product modules and independently reconstructs source demands, durations, dependencies, calendar/downtime, acquisition, release, capacity and native export.

Execute in an isolated app container, never install or start the app on the VM host. B2_INPUTS points to the independently verified `inputs/raw` containing `UAT-07`. UAT07_OUT is an absolute private output directory. Install the committed lockfile, locally provided Praetor SDK tarballs, Playwright1.56.1 and Chromium. Build with `npm run build`.

```
B2_INPUTS=... UAT07_OUT=.../api node --experimental-strip-types qa/uat07-bundle-api.mjs
B2_INPUTS=... UAT07_OUT=.../ui bash qa/b234-browser-runtime.sh node --experimental-strip-types qa/uat07-bundle-browser.mjs
UAT07_OUT=... node --experimental-strip-types qa/uat07-bundle-diagnostics.mjs
python3 qa/uat07-bundle-oracle.py .../inputs/raw/UAT-07 ...
```

UAT07_CASES resumes only selected API cases; preserve original output SHA. The capacity2 case expects B45 due to literal original04 downtime, not B30. Synthetic QA roles are explicit; the host fixture does not validate production SSO. No UAT06 results transfer, UAT08+, main merge or publication. QA UAT07 is separately dispatched by PM after the integrated candidate is ready.

The resource workspace also follows explicit saved mappings back to original05 capacity rows; identity is never guessed from a matching code. `uat07-bundle-contract.json` separates original facts and supplementary settings. Five focused regressions cover boundary diagnostics, deduplication and raw05 trace. Run `uat07-bundle-finding-browser.mjs` after the full browser flow with UAT07_REPLAY_STORE pointing to its business-final.json and UAT07_CORE to its core.json. This deliberately illegal replay fixture checks an independent-checker-only finding -> both tasks -> original12 row10 and original05 row2 -> same frozen input.
