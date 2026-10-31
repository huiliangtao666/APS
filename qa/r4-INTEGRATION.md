# R4 kg / fixed-program route integration

Continuation delivery `dlv_c71cb13e-596f-4ca6-9f9e-46abfed34f67`, r1;
dispatch `b234:uat05-09-10-11-12-13-14:engineering-continuation:833b3d5:20261031:r1`.
Exact source/parent `833b3d56929f88c9521cb64765066eece9f83879` integrates B1,
B2, final B3 and B4. Historical PASS stays on its historical SHA.

## Execution

The existing B2/B3 planner handles existing non-pair routes. A server-selected
path handles explicit kg, sequential fixed-time routes containing at most one
batch-heat -> max-wait cooling pair. Names are configured, never HEAT/COOL string
matches. Production IDs derive from frozen quantity/yield and applicable machine
load basis; IDs never include resource groups. Only compatible heat operations
may share a furnace. Cooling and other operations keep individual production IDs.
Cooling/downstream qualified-output machines use qualified kg; upstream/heat
BOM-total-input machines use input kg. Nonkg/arbitrary load nodes, general
regrouping and cross-batch packaging-rounding decisions remain blocked.

Actual upstream tasks are scheduled before proposing a pair. B4 remains a pure
proposal with integrated=false; the integrator supplies real predecessors and
committed machine/space ledgers. Every proposal is checked again against full
machine/calendar/downtime, tooling/personnel windows and shared physical pools,
material eligibility and pending deductions. Cooling includes its complete
interval and future space reservations. Any changed time reruns all checks.
Retries can move heat, move a cooling window or shrink a heat resource group;
they never reduce production quantity or fixed program duration. Bounded search
failure does not prove global infeasibility.

`createMaterialAllocator().begin()` owns a private multi-time ledger. stage()
sees prior staged deductions but exposes uncommitted rows. Generation changes
reject stale transactions. commit() publishes the complete deduction set once;
rollback() discards it. Pair tasks and all resource/material ledgers append only
after every pair operation passes. Committed prefix tasks remain valid on pair
failure; no heat-only task, leaked reservation or partial material commit survives.
Downstream starts only after cooling commits.

Every retry selects the actual-feed BOM and recomputes exact quantity and rounding
guards. Heat compatibility includes the recipe at actual heat time and actual
upstream material-version history. A changed recipe rebuilds the proposal and
does not reuse ready-time keys or material tokens.

## Verification and guards

verify-process-route.mjs imports no planner, identity builder, adapter, proposal
or allocator. Frozen sources determine production count/quantity, expected IDs
and operation coverage, predecessors, fixed durations, heat-only compatible
membership, input/output load, single furnace occupancy, full output-space and
wait windows. Existing frozen-resource and material checkers also run. Missing
operations produce PARTIAL; invalid scheduled content produces PROBLEM. Saved
verification fields are informational and never admission authority.

MAX_LAG supports only valid source-derived kg/fixed-pair prerequisites; incomplete
configuration refuses atomically. Delivery assessment calls the source checker
again and retains MAX_WAIT_UNRESOLVED unless the order's entire applicable route
passes. Client flags, strings and forged saved PASS cannot bypass guards. The UI
shows pair scope and independent results; native CSV adds operation load basis,
program, pair contract and verification fields. Historical snapshots retain their
data and scope.

## Replay and limits

Run qa/r4-replay.sh at the final fixed 40-character SHA through the official
app-exec.sh, standalone isolated application container. Never install dependencies
or run the app on the VM host. A clean replay needs package-lock dependencies,
the two SDK tgz packages at repository-relative paths, Playwright/Chromium and
the original directories referenced by B2_INPUTS, B4_INPUTS and B234_RAW_B3.
Set absolute private B234_OUT/R4_OUT, B234_PRODUCT_SHA and generated fixture paths.
The browser wrapper extracts shared libraries to scratch without changing services.

The replay runs existing B234 build/regressions/browser paths and new R4
core/boundary/negative/API/application Worker, separate-process persistence and
root React paths. Run the three Python standard-library source oracles listed
in r4-replay.sh separately. The new R4 oracle reads source CSV and independently
checks rational quantities, identities, full coverage, resource events, material
conservation and downloaded native CSV; it accepts any complete legal schedule.

Fixtures explicitly supplement BOM version/effective dates, normalized order
fields, fixed PACK50, resource configurations and synthetic roles. They are
software facts, never customer defaults. Original17 fields, original BOM
version/effective dates, original05/06 choices and PACK speed remain customer-fact
BLOCKED items. Cross-batch packaging rounding, nonkg granularity, arbitrary load
nodes/general regrouping and tail adjustment remain BLOCKED decisions. UAT17
is R6 reference only; no QA UAT/signoff, merge or publication is implied.
PM owns original cards/Issues/UAT and QA dispatch. Only APS-PM receives the single
DEV_DELIVERED notification for this delivery.
