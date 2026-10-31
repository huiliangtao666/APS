# Fixed B2+B3+B4 integration checkpoint

Authorized delivery `dlv_cd8fda2f-fd66-4947-83b1-8f03d883695b`, revision r1.
This branch integrates the fixed B4 source (which already contains fixed B2 and
B1) with FINAL B3 `9805bb5fbc82d8a0335c3125497b9a2727a2ddc7`. The actual merge
has both source heads as parents, no text conflict. This is a bounded PARTIAL
checkpoint. Production B2/B3 paths coexist; B4 remains a pure process proposal.
No MAX_LAG capability or delivery guard is lifted. It is NOT a QA UAT candidate.

## Reviewed planner seams and exact remaining engineering work

| Seam | Observed contract | Remaining work before complete R4 route |
|---|---|---|
| Production identity vs resource group | `production-batches.mjs` creates production records only after checking every route machine uses BOM total input; then groups entire routes and expands every operation. `batchSummary` writes BOM total input for every step. B4 needs heat-only groups and cooling qualified output. | Separate immutable production records from operation resource groups. Support the specifically authorized heat/cool pair without broadening arbitrary load-node/regrouping semantics. Preserve IDs in result assessment, reservations, export and verifier. |
| Upstream predecessors | Existing planner schedules one entire order/group at a time. Adapter consumes already validated upstream tasks per production batch. | First schedule upstream operations per production member; give only validated actual predecessors to the pair adapter; schedule downstream only after accepted pair commit. |
| Complete cooling interval | B4 module scans full half-open machine and space intervals, including future reservations. | Translate all existing machine/space reservations into its scope; do not treat the module ledger as a complete all-resource ledger. |
| Maximum-wait backtracking | B4 shifts heat and can split heat groups. Its proposal has `integrated=false`. | Re-enter full joint candidate validation whenever a pair shifts. B4 module PASS cannot imply all enabled resource/material conditions passed. |
| Every enabled resource/B3 after shifts | Existing one-task planner resets material preview and scans machine/calendar/tool/personnel on each retry. New integration simulation forces180→210→240→250→280→300→310. | Extend this contract to every shifted task of an entire heat/cool proposal, including pending group reservations. Current tests prove existing one-task rescan, not pair rescan. |
| Private staged allocation | B3 preview stages all demands of one preview; generation rejects stale tokens. A successful commit mutates allocator closure; there is no fork/checkpoint/rollback API for multiple feed times. | Add a private multi-time transaction whose pending deductions are visible to later proposal tasks; discard on any failure. Never commit sequential pair tasks and attempt to reconstruct rollback. |
| Atomic pair commit | Current planner commits material and appends resources/tasks one operation at a time. | Stage all pair allocations and all ledgers together, then commit once; no partial heat without cooling, no lost deductions after refusal. |
| BOM version at actual feed | B3 calculates demand at each retry's actual feed; next-day test proves162.5→160. B4 adapter chooses `recipeKey` at upstream-ready time before module backtracking. | Recompute BOM/quantity/compatibility at every actual material-feed time in pair proposals; rebuild if changed. Do not reuse a pre-shift material token or ready-time recipe key. |
| Trusted checker/admission | Production `MAX_LAG` capability remains unsupported; fixed delivery `MAX_WAIT_UNRESOLVED` remains. Existing independent verifier reconstructs conservative whole-route groups. | Implement source-derived pair identity, coverage, heat deduplication, output-space and wait checks for ALL applicable route assertions. Only server-owned verified coverage may enable a capability; no client flag/contract string bypass. |

These are incomplete engineering integration, not unresolved customer semantics.
They cannot be moved to QA or mislabeled as customer blockers. The next owner is
APS-Dev under PM coordination; continue on this branch with a new fixed SHA and
rerun the affected assertions. No further product authorizations are needed for
the already approved explicit kg fixed-program UAT12/13/14 pairing scope.

Separate customer facts/decisions remain BLOCKED: original order split/type/status,
BOM version/effective dates, original05/06 resource-policy choices, PACK speed
meaning; cross-batch packaging rounding, nonkg granularity, arbitrary load nodes/
general regrouping and tail adjustment. Obtain sourced choices through PM; do not
invent defaults or count these as product FAIL. DEC04/05/06 stay design/mock.
UAT17 is R6 reference only and is not an R4 closure gate.

## Reproduce in an isolated Node22 application container

Use the fixed SHA, SDK tgz packages at the repository's relative paths and install
dependencies INSIDE the app container. Supply original UAT03/04/06/07/08 under
`B2_INPUTS`, UAT12/13/14/17 under `B4_INPUTS`, raw UAT05/09/10/11 under
`B234_RAW_B3`. Originals must remain byte-identical. `B3_FIXTURE_DIR` and
`B234_INPUTS_DIR` are newly generated, explicitly synthetic data, not originals.

Run `qa/b234-replay.sh` with an absolute isolated `B234_OUT`, these input paths,
`B234_PRODUCT_SHA`, and a Chromium installation via `PLAYWRIGHT_BROWSERS_PATH`.
The script runs production build, core tests, impacted B2/B231/B3/B4 assertions,
new cross-package checks, real root React/API/application Worker, native exports,
Plan reopen and separate Node-process restart. The browser runtime wrapper only
extracts private system libraries to scratch; it does not alter platform services.
Run the independent Python oracles from the script output as documented there.

`qa/b234-host.mjs` can be run in a disposable app container with
`B234_DISPOSABLE_QA=1 B234_HOST_DATA=/absolute/empty-directory B234_BROWSER=1`.
It uses synthetic planner/supervisor/query members and accepts `test-sub` solely
in this QA host. Production never imports it. It provides a repeatable isolated
review environment, not a published endpoint or a production SSO claim. The test
processes are stopped after checks. Do not use it as evidence of full R4 readiness.
