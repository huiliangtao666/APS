# #50 production minute implementation — NOT READY

Authorization: https://github.com/huiliangtao666/APS/issues/50#issuecomment-6581814731
Original event: dlv_13b4162c-9de4-447d-a5e5-c0f15ee0fe08:r1; source continuation r2.
Continuation delivery: dlv_cd90f195-921c-48d0-9235-4133ef512cbb.
Source owner APS-Test; sole main writer APS-Dev. Active worktree/branch remain
apps/workbook-preview / test/query-reports-20261102.

The branch was fast-forwarded from e93daf87812cfeb8201de0613925c25ede67c4c0 to
observed main a3c2f9a7507c7e8ae83947342d7f2944626b94c1. Main already contains the
external PR54 WIP merge, ES2020/build asset fixes and the CP016 correction. This
continuation must be reviewed as its exact new commit, without merging the old
WIP history again. The external merge did not validate #50.

## Original failure and harness correction

The r1 command was `node --max-old-space-size=192 /workspace/temp/issue50/input-check.mjs`.
It parsed the complete private B/P files (181 definitions, 4862 parameter instances,
all V2 tables), then exhausted V8's heap in deserialization during preparation.
There was no INTEGRATED marker, successful import, build or actual calculation.
Linux/cgroup oom_kill was 0. The failure remains SELFTEST_V2_PREPARATION_HEAP192_OOM;
it is not evidence of a deployed-product OOM or a product repair-round increment.

The old harness retained the B/P buffers and parsed graphs together. The old
opt-in test additionally held forward and reverse full datasets simultaneously.
The replacement qa/equipment-minute-v2.mjs separates parse B, parse P, B prepare,
P-first, forward adoption, reverse adoption, and each readiness check into eight
sequential short-lived processes. Each stage keeps complete private snapshots,
including all tables/rows/cells/formulas/definitions/candidates and validation.
Only compact adopted facts cross the forward/reverse comparison boundary. The
original bytes/SHA256 and full V2 counts are asserted. The cap remains 192 MiB
(or a lower explicit caller cap); the first failed stage terminates the check,
with no retry. An internal 180-second deadline fits within the prior 240-second
outer tool bound. No private input was parsed or stage executed in r2.

After PM explicitly hands over the execution window, the finite check can use
`node --max-old-space-size=192 qa/equipment-minute-v2.mjs` in the official app
container, with APS_V2_BUSINESS_FILE and APS_V2_PARAMETER_FILE pointing to the
verified originals and APS_V2_SCRATCH to a new task temp directory. This command
is documentation of the changed condition, not permission or an automatic runner.
All module, build, candidate, browser, Worker and import actions still need the
actual window and applicable remaining budget under the original contract.

Shared cloning was only inspected: prepareBusinessImport clones incoming/old
and selected previous metadata; integrateParameterImport clones old;
checkSelection clones its input; runtime, selection and query context also clone
snapshots. None of these shared files was edited. Mutation isolation and the
full production validation path remain intact. Stage measurements must establish
whether any shared change is necessary before coordinating a single file owner.
The r1 native stack does not identify which JavaScript clone call failed.

## Implemented source changes, pending execution

- E3 has an equipment/day heatmap with selectable metrics, independent metadata
  preferences, sticky headers/resources, unknown denominator styling and cell
  detail. Natural interval unions, task/WIP/cleaning minutes, start-day production
  quantity, frozen daily capacity and work-window utilization remain distinct.
  Ambiguous crew availability remains null. Overlapping calendar/stop intervals
  are unioned rather than subtracted repeatedly. The chart and table display
  the same page; cells outside that page say so. 100/200/500 paging and full-query
  export keep access to all records.
- E1 has chart metadata preferences, exact minute titles, explicit WIP/known-stop
  layers, and real same-production predecessor highlighting. Task location uses
  an exact ID; it does not use substring search to locate T1 among T10/T11.
- E2 preserves unplanned demands and null readiness/arrival dates; frozen demand
  windows are exposed without asserting actual delivery or production completion.
- E3/E4 apply the selected task/material/equipment context, including explicit
  empty selections. Tool tails that cross the next date boundary stay occupied.
  Legacy WIP without explicit entity mapping is reported as unknown; a tool is
  not guessed from the pool. Head/tail labor segments merge when they overlap,
  so the same people are not counted twice on a short operation.
- E5 includes shortages/findings/all allocations/suggestions, including risks
  without tasks. Dates and scheduled/unplanned filters use existing associations;
  missing need dates remain null. Quantity summaries distinguish source kinds
  and units instead of adding shortage, allocation and suggestion quantities.
- Detail exposes the frozen resource/calendar/known-stop/verification basis and
  file/table/row/key sources. Real chain traversal uses predecessor edges within
  the same production batch. Old day coordinates use their own frozen dayZero;
  exports retain the original numeric values and do not mutate old run hashes.
- Per-actor/per-view main/chart/drawer preferences are isolated. Run/condition
  changes cannot display or export a stale page as the newly selected query.

The 15-case module file contains 9 new regression cases for these changes and
retains the original cases; the opt-in private V2 case delegates to the staged
harness. Expected values are hand-computed examples, not cached solver output.
The cases were not executed. Four changed JavaScript modules passed syntax-only
node --check (no imports evaluated); git diff --check passed. TypeScript, Vite,
API, Worker, real V2 import/P-only update, both actual calculations, six-view
browser/reopen/export, QA and UAT all remain NOT_EXECUTED for this source.

## r3 bounded execution and precise product correction

Authorization: https://github.com/huiliangtao666/APS/issues/50#issuecomment-6584051209
Continuation delivery: dlv_f3b02ffd-68b1-42a6-99d4-2e52387fdf45.
The original event continues as dlv_13b4162c-9de4-447d-a5e5-c0f15ee0fe08:r3.

At fixed source 7d15bcbeaa3b06009b77936e800b57cd6cd35ff9, the single
15-case module invocation produced 14 PASS and one intentionally skipped private
V2 case. The private check was invoked separately exactly once. Parse B, parse P
and prepare B passed with original hashes, full rows and validation preserved.
P-first adoption failed with 174 PARAMETER_INVALID issues: 168 CP066
temperature fields incorrectly treated the existing relation `须≥最低温度` as
a numeric limit, three resource modes `重量容量共享` were absent from the
executable enum, and three physical tool quantities used the valid unit `套`. No new OOM occurred. Forward, inverse and
both readiness stages were not executed. The old r1 OOM remains historical,
and later full-V2 memory/readiness behavior is still unverified.

The correction in server/parameter-contract.mjs recognizes only the exact CP066
and CP093 paired-field directory statements already enforced by parameterIssues
for each object/scope/effective boundary. It defers those statements to that
existing relation validator, including when P arrives before business objects.
Numeric boundaries, unknown statement rejection, units, missing values, all
input rows, metadata and later paired comparisons remain enforced. This is a
shared parameter-validation seam correction under the restored #50 ownership;
no old deployment/source/state/build was changed. Four small regression cases
exercise P-first import, future EDIT temperature reversal, future waiting
reversal, unknown bound rejection and strict CP016 positivity. Resource adoption
now preserves both explicitly supported weight-sharing literals, and the
allocator and frozen checker apply the same 5000kg limit to either spelling.
Available resource quantities accept physical tool sets, with object validation
rejecting `套` on equipment and rejecting mass units. Independent expected
5000kg/5001kg checks cover existing WIP and allocation; no real calculation or
private dataset is rerun. The last permitted targeted invocation produced four
PASS and one test-message mismatch: changing a stored tool unit to kg correctly
failed earlier at the existing frozen dimension guard, rather than the unit
allowlist expected by the assertion. That assertion now accepts either precise
validation rejection, but was not re-executed because all three module calls
are consumed. No final full selftest PASS is claimed. Actual execution
results and final source identity are in the r3 workspace result/evidence.

## Current gate — continuous bounded V2 development selftest

PM continuation 6584473186 replaces the module invocation-count stop. The
corrected five regression modules, complete P-first adoption, both full B/P
orders, both readiness checks and the effective-fact/minute-mapping comparison
now pass, with every original row retained and 192 MiB heap limits. Prior
failures, one controlled 120-second forward-stage timeout, runner fixture
failures and earlier OOM evidence remain in the workspace r4 archive.

The continuation fixes repeated parameter-identity serialization, delegates typed
parameter values to the strict contract instead of the legacy numeric column,
uses the physical tool as the tool-pool row key, and preserves unsupported B
metadata as explicit candidates. B compilation retains original formulas and
position bindings, records semantic-binding warnings, and preserves the B
object/field projection before P precedence. Position references cannot overwrite
effective P values or poison expiry fallback. P-first relative-unit placeholders
resolve once when B first supplies the object; concrete frozen dimension drift
continues to reject.

Minute readiness uses explicit route minutes rather than pending legacy CP080 day
lead proposals. CP080 remains blocked with no B fallback or suggested formula
execution. Demanded products still require box weight; bulk semifinished inputs
need no invented packaging weight. Day-profile checks and required actual minute
parameters remain strict. The added tests include normal, invalid-value,
source/scope/period, exact rejection-code, fallback, dimension-drift and tool-key
checks. Full source/input hashes and unaffected artifact reuse are recorded in
r4; an old PASS is never relabeled as a new source execution.

E1–E6, EV01–28, DV01–17 and the 45-row acceptance scope remain. Build, isolated
candidate, real Worker/browser evidence and independent QA are separate later
gates; this first-segment PASS does not sign those results or user UAT. No main
write, old deployment mutation or publication is authorized by this document.

## HTTP preparation memory continuation (original event r7)

The current-version guard reads dataset metadata, avoiding a second full frozen
snapshot load. Parameter preparation clones mutable input tables and root
metadata; read-only reference tables retain their exact content and ordering in
the frozen object. Readiness receives the same input-only evaluation view as
calculation, so selection dependency checks do not deep-clone reference results.
No reference table is removed from persisted input. Effective P precedence,
source identity, selection/token checks and legacy day derivation remain intact.

Targeted tests compare dataset/trial/expired-period projections and legacy day
bindings against the previous full-clone semantics. A bounded complete-snapshot
check retains the original 38,493,169-byte input and all tables, exactly matches
the previous readiness response/token and an independent in-place preparation
identity, and exercises the run route with a mock Worker (one dataset load plus
one metadata read). The copied projection is 20,882,099 bytes; 17,611,070 bytes
of reference results avoid each deep clone. Its measured maximum RSS is 458,340
KiB with Node heap capped at 192 MiB; no new OOM or protection drift occurred.
This is preparation validation, not a real calculation, browser or QA verdict.
A missing mock terminate method was corrected; its original failure is retained.

The subsequent candidate uses a newly bundled server and the unchanged r5
frontend/calculation/import artifacts, each with separately recorded source and
hash provenance. It is not represented as a new full build. Runtime budgets and
first-resource-stop gates remain those of the latest original Issue #50 contract.

The r7 immutable candidate passed HTTP readiness and created a real baseline run
with the expected complete frozen identity. Its Worker returned a plan, but the
independent verifier rejected cleaning direction/timing on DAY-T2 and predecessor
maximum waiting on DAY-T8. There was no new runtime OOM. The failed run and all
historical state remain; the rejected plan itself was not persisted by the product.

Two focused public regressions then reproduced unsafe insertion before a
reserved successor cleaning, and a wait clock reset after material readiness.
Minute placement now checks the actual predecessor end (also for WIP), preserves
same-operation batch handling and the exact allowed boundary, and rejects an
insertion that would invalidate a reserved successor's directed cleaning.
Both regressions and the affected shared-weight/WIP check pass. This does not
claim the unavailable original rejected task bodies were inspected or that the
full baseline now passes. The fixed candidate was released before source edits;
these later solver fixes have no new runtime/bundle verdict. Remaining baseline
and candidate budgets are exhausted, so no P-slot substitution, restart or QA
readiness is inferred. A follow-on minimal calculation-worker bundle and a new
immutable candidate/baseline attempt require explicit incremental runtime budget.

## r8 changed-solver runtime and parameter-view continuation

The explicitly added calculation-worker-only bundle at source
`0ece1e0977b411177e27bb3cde0e2e39deb9e727` was built with the exact 81-input
closure. The r7 server and r5 frontend/import artifacts were reused by hash.
One new immutable candidate accepted real baseline run
`fef9cde1-dced-4159-be8b-286f9a2c3e66`: partial, 700 demand records (94 scheduled,
606 unplanned), 9 actual tasks, independent verification pass with no unchecked
sections. Frozen input is
`2e2cb1c76503ee0d680c9c8c1407b53368ee7d9b35b952bacdbfa6c923c0a6f8`;
result is `5323495221c183734cc56f2c515169f5aa63fe4171faf561293ea0673e8b1e9c`.
The former DAY-T2/T8 self-test rejection is resolved for this actual baseline;
historical failed runs remain intact. Partial is not all-demand feasibility.

Continuation reached the canonical parameter-maintenance GET, filtered to CP172
and RT009. It timed out after 90 seconds before any parameter mutation or P
calculation. The synchronous parameter projection repeatedly scanned every
source row and recomputed semantic identities. The candidate was released before
source changes. Parameter view now uses per-call effective/source identity maps
and filters immutable CP/object identities before enriching display records.
Source precedence, first-source values, validity intervals, trial scopes,
candidates and pagination retain their previous meaning; no cache crosses calls.

Two focused regressions passed. Twenty small before/after differential cases
completed before a runner's narrow-count assertion was corrected (22 CP172 rows,
not all 26 route parameters). The initial data-URL oracle import required a
file-URL correction. These runner failures remain in evidence; unaffected tests
were not replayed. The corrected full-input projection then passed at heap
192 MiB: narrow view approximately 85 ms and full parameter page approximately
398 ms, with all 29 tables, 181 definitions, 4862 original P instances and 9292
combined parameter rows unchanged. This is not a new HTTP runtime verdict or a
rerun of V2 import/adoption/readiness/calculation.

The final parameter-view repair is absent from both worker bundles and frontend;
it requires only a changed server bundle and a new immutable candidate to
verify through HTTP. The new baseline allowance is exhausted (cumulative 3/3),
so it must not be rerun. Preserve the accepted baseline state and use the
original unused P calculation slot and browser context for remaining work.
E1–E6, shared query/source/pagination/export, parameter-update contrast and UI
save/reopen remain unverified. No READY_ENV, QA, main integration or publication
is claimed. APS-Test retains the original package; APS-Dev is sole main writer.
