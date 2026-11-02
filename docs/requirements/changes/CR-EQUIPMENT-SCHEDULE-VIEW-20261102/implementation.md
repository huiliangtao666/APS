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

## Current gate

Dev49 delivery 36359c68 retains the actual runtime window. This source-only
continuation adds zero app-exec, tests, build, install/pull, candidate start,
HTTP/browser, import, Worker, calculation or publish actions. It does not establish
OOM resolution, change the original 45-assertion matrix to PASS, complete #50,
reopen #45/#47, or authorize main integration. PM must first confirm actual final
release/0owned/0pending, fresh protection/capacity/READY and explicitly hand over
the concrete next execution. The same #50 owner then continues implementation,
self-repair and retest against the original EV01–28/DV01–17 contract.
