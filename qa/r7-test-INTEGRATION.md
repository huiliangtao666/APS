# Issue41 R7 query/report and pre-confirmation data domain

Dispatch: `dlv_e35a72db-7415-42e8-969e-268408d33a15:r1`.
Scheduling key: `r7:query-report-domain:20261031:r1:APS-Test`.
Product branch: `test/r7-query-report-core-20261031`.
Safe adopted parent: `b8512a3853160fca8deaf374cb1c5da3ea9e771c`, after checking changes since authorized `a0b846e5b7aba5ee165b8d12fabfe8896fbc4ff2`.

## Single integration owner: APS-Dev

`src/lib/r7-handoff.mjs` is a Node/server module. It imports existing server review/report logic. Do not import it into the React browser bundle. Keep original six-view API, filter/window rules, resourceLoad and comparePlans. It is a pure data inspection, performs no workflow writes, and creates no role or approval step.

- `querySavedReport(state, query)` uses the existing scoped-report query (`kind`, `planId`, `otherPlanId`, `text`, `order`, `start`, `end`). It verifies original input/run provenance through the existing source guard, returns the exact stored records, and adds saved-result completeness with a new view digest. `savedReportCsv(report)` rejects a changed report and retains the same view ID, metadata, literal rows and explicit completeness. Use the SAME report object for page and export. Empty filtered rows still have provenance and completeness. Orders/materials/unplanned/differences retain whole business records; time clipping applies to task/occupation windows. Shared physical rows are never split into fabricated per-order quantities.
- `savedResultCoverage(plan)` reports missing tasks, duplicate IDs, saved report coverage, unknown reasons/quantities/units and invalid execution time. It does not generate missing historical tasks or recalculate old inputs.
- `assessHandoff(state, planId, decision, now)` reuses `reviewPlan` (frozen-source integrity, supported replay, independent resource/calendar/material checks) and adds coverage and explicit acknowledgements. Decision keys are `allowPartial`, `unplannedIds`, `acceptConditionalSupply`, `acknowledgeScope`. This is not an API authorization object and must not replace the actual transaction's reviewer/hash/concurrency checks. Actual endpoint currently uses `acceptPartial`; Dev maps that existing field to `allowPartial` without changing business policy. `finalIndependentReviewRequired` stays true and `workflowActionPerformed` stays false. Always run the actual application's final independent review against current revision before submit/confirm/release, and preserve existing role/audit/CSRF/history gates.
- `recordedPackageStatus(record)` returns actual `taskResult` and `qa` records. Done/archive with no QA record yields NOT_EXECUTED. No promotion of Test selftest to QA/UAT.
- `currentExchangeContract(matrix, defs, recordKeys)` supplements the literal historical FR036 matrix with actual current fields and unique keys. It retains chapter9 identities and flags old static template drift. `exchangeCsvTemplate(contract,key)` creates BOM/UTF-8 CSV HEADER from actual current fields; no external connector or actual customer ownership is inferred. Dev owns public matrix/template/React/schema files and must update actual static documentation and download routes consistently. The inherited FR036 contract suite fails 36 vs 38 on BOTH adopted parent and this source; raw baseline and current logs are in evidence. Newly generated contracts must not be advertised as already integrated into PG01.

## Compatible changes to existing domain functions

queryData/queryCsv signatures stay compatible. Task rows add line/unit/source hash/simulation metadata and support both taskId and taskIds reservations. Missing minutes display unknown. For sourcePlanId exports, `查询输入版本` now uses the frozen plan revision and `请求时当前输入版本` separately records the request revision. Existing caller must provide the validated original input; queryData alone is not a provenance validator. Existing metadata labels distinguish live-input queries from historical ones.

result-assessment retains status shape and adds explicit unknown-quantity/unknown-batches states, safe null timestamps for values outside Date range and missing finding-code tolerance. delivery-assessment keeps its formulas and uses safe empty arrays when tasks/findings/allocations are absent; absence does not imply delivery. CSV guards handle whitespace-prefixed formulas. No DEC04–06 application defaults, B02 global reservation, P1 extension or FR031 rewrite.

## Outstanding application and acceptance responsibilities

APS-Dev: serial merge after fetching current main and checking exact file intersection; preserve all B09/B12/B15/shared-entry and governance work. Record source→main SHA, parents, merge base, conflict resolution and targeted integration. Wire real report UI/API/export permissions and audit, submit/return/confirm transactions and immutable confirmed history. Update FR036 actual static metadata/templates and run original full parity test. Actual application BP01–BP07 and overall AC25 remain unexecuted here.

APS-PM: process once by original delivery:r1, preserve B12/B15 package dependencies, update sole Issue41 and original FR/AC residuals. QA is called only after final candidate and complete scene entrance are ready. APS-QA: final overall UAT after PM dispatch. No publication or QA-environment overwrite in this delivery. AC27 has only an explicit synthetic one-line query profile; no agreed scale or pass threshold is invented.

## Reproduce in the app container

Use official `app-exec.sh --validate --mode standalone --cwd /workspace/apps/r7-query-report-core` with `R7_SOURCE=<full product SHA> bash qa/r7-test-replay.sh`.
If npm install is killed by environment capacity, a read-only runtime dependency cache may be copied into the disposable directory via `R7_DEPENDENCY_CACHE=<container node_modules path>`; direct dependencies are checked against package-lock before build. Neither host dependencies nor a deployed app directory is installed/started/changed. `NODE_OPTIONS=--max-old-space-size=256` was used for the recorded bounded run.

The script builds tsc/Vite/server/actual calculation Worker, runs affected query/result/delivery/report/confirmation tests and new domain tests, captures the known static FR036 parity failure separately, and tests actual built Worker output plus JSON save/reopen through the new domain. Actor-injected confirmation regression is synthetic and does not certify real SSO/platform identity. The new gate/query APIs are not yet used by the actual application routes; direct domain assertions and old application regression are separate evidence.
