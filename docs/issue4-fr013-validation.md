# Issue4 / CR-FR013-VALIDATION-20261029

Authorized dispatch: dlv_f8e143db-f33c-4b02-bed6-43722e9889ef, result event dlv_f8e143db-f33c-4b02-bed6-43722e9889ef:r1. Requirement version: APS-BL-001 v0.3 + effective CR-FR013-VALIDATION-20261029. This is an approved incremental requirement, not a repair round or a reversal of historical scoped PASS results.

Source: latest origin/main change-register.json, Issue4 comment https://github.com/huiliangtao666/APS/issues/4#issuecomment-6500755006 and unique Project2 item PVTI_lAHOFM9WU84BpE1czhEHgrg. The card was read with the workspace GitHub credential; its status is In progress / NOT_READY and its current requirement version includes this CR. Earlier credential-helper token lacked read:project; workspace-token read succeeded. No card status is changed by Dev.

Base: e0be9b6dfbf9be7ce404edc1b80d8c50858ed3dc; independent branch feat/issue4-fr013-validation. No merge with main or the separate FR010 branch.

## Implementation and inventory

The existing 07 six-column and 08 four-column templates remain unchanged. CSV single-table/batch preview and commit, table edits, multi-table edits and trial edits all converge on saveInputs -> validateInputs -> validateMasterData. Direct calculation and the Worker planner also use master validation. Added exact decimal-text checks reject fractional bag counts and yields over one, including 1.0000000000000000001; values are never rounded or rewritten.

Existing explicit configuration is reused, rather than introducing a second configuration store. Product fields are editable per product; material fields are editable per material. UI help is shared by the editor and both CSV panels, with downloadable field matrix and Chinese instructions updated. New rows remain blank. No new default, inferred enum, unit conversion or numeric business setting is introduced.

| Field | Type / unit | Approved validity / storage |
|---|---|---|
| 单支净重kg | decimal kg/支 | Existing >0, explicit required value |
| 每袋支数 | integer count 支/袋 | >0 and integral, no rounding; 12.0 is numerically an integer and retained literally |
| 总收率 | decimal ratio, dimensionless | Existing >0 plus new <=1; 1=100%, .96=96%; no percent syntax or scale guessing |
| 模拟交付等待分钟 | decimal minutes | Existing nonnegative, explicit zero allowed; missing blocked |
| 物料单位 / 类别 | nonempty text | Editable custom values, no invented whitelist or default; existing BOM/supply/execution unit consistency still applies |

Authorization remains planner/supervisor for mutations, query read-only, server actor verified in production. Operations record reason, actor, prior/current values, fromVersion/toVersion and atomic batch ID. Optimistic revision and owned server preview prevent stale/foreign commits; failures do not write input, audit or history.

New saved inputs are content-addressed with inputVersionId. freezeRunInput deep-copies them into executionData and snapshotHash. Newly started /runs use that version through the real Worker; frozen old runs/plans/confirmed snapshots keep original inputs and results. Historical invalid values remain readable; current configuration with invalid values blocks new runs until an authorized complete correction. No history migration or normalization is performed. An existing unsupported unit conversion remains explicitly blocked: configuring a unit does not add a new physical conversion algorithm.

AC-02: only these affected categories and validation paths. AC-03: no-op imports and old plan/run/confirmation preservation. AC-26: saved/reopened field values and original-plan product export. Full FR013 categories and full AC26 report coverage remain outside this increment.

## Verification and independent replay

Run qa/fr013-validation-checks.sh inside a disposable app container with project dependencies and Playwright, from checkout root. It builds React, Express and the production Worker, runs boundary/API/real Worker/history tests, npm tests, focused previous CSV/P08/confirmation/Worker regressions, then real React Chromium flows. qa/fr027-fixture.mjs uses a QA-only synthetic membership actor and runtime alias; neither is production wiring or Portal SSO validation. Browser runs against real compiled React and Express, with separate JSON persistence.

V01 exact arithmetic boundaries; V02 physical line4 localization and single/mixed/edit/trial zero-write rejection; V03 legal config, read-back, versions, audit and role/owner/stale guards; V04 real source Worker plus production Worker, ratio/pack-size effects, old snapshots and export; V05 legacy invalid state read unchanged and new-run rejection; V06 real verified/submitted/supervisor-confirmed history and recreated-router persistence. B01-B04 cover actual React reject/correct/re-preview/commit, editable configuration save/reload, templates and query role.

Synthetic independent arithmetic oracle in V04: 480kg / .96 * .65 = 325kg LEAN; 480kg / .8 * .65 = 390kg LEAN; ceil((480/.04/12)/(1-.01)) = 1011 packaging items. Custom material unit/category are frozen literally; no unsupported conversion is claimed. Regressions use the original valid 07/08 fixtures; only the former test explicitly accepting fractional bags and >100% yield is changed to the now-approved range. Historical test evidence remains on its original SHA.

## Integration, rollback and limitations

FR010 b7189157 changes server/business.mjs, App.tsx, inventory and material-allocation code; this branch changes none of those files. There are no changed-file intersections with that FR010 delivery. Both affect validation/allocation behavior through different modules; PM should arrange integrated import/availability/material regression if combining them. This branch retains the fixed parent and does not absorb FR010.

Rollback uses the prior product version with its prior semantics; no stored shape change needs a reverse migration. Do not force-push, publish, merge main or change existing histories. New code does not change CR-DEC04-05-06 design/mock settings. No repair round is assigned because no new product FAIL was dispatched. Dev self-check evidence does not establish independent Test PASS, full card readiness or QA UAT. PM owns follow-up Test and original-card state.
