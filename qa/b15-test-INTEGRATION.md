# B15 independent domain integration

Authority: Issue40, delivery dlv_586f8017-7984-445c-865d-f73cbd231c6f:r1.
Dispatch key: b15:independent-domain:20261031:r1:APS-Test.
Source begins at B09 66d4d43e4b1cc566a47d96a93671d179d8921434. Dev owns serial main integration.

## Existing interfaces

`comparePlans(a, ad, b, bd)` keeps its arguments, version FR028-v1 and existing fields. Results are now detached from caller objects, including unchanged resource/material records, conditions and check scope. It compares saved evidence, never current profiles or a new schedule.

Additions:

- `execution: {before, after, known, changed}` contains saved execution summaries (facts, consumption, source, events and historical resource information where present). Missing evidence stays null/unknown.
- `impact.orders[].bottlenecks.{before,after}` contains `timing`, order-associated `findings`, checked conditional/short material rows (or null), `supplyConditions`, full saved `deliveryConditions`, task-level `unplanned`, and `inference: saved-evidence-only`. No attribution to a single changed input or optimization claim.
- No new persisted schema or CSV fields. Existing `orderOutcome`, copied-result guards, unknown delivery, scope/settings/demand noncomparability and per-operation unplanned quantities remain intact.

`stageEvents(before, proposed, submitted)` keeps `{data,issues}`. On any rejection, `data` is a fresh clone of **before**; accepted effects remain append-only. Callers must still check issues before saving and run normal input/transition/admission validation. No partially applied event or candidate input may be persisted from a failed batch.

`restoreBlockers` is deliberately unchanged on this branch. Live main has newer confirmation-history wording/reference; preserve main's implementation when integrating. No historical restoration or FR031 reopening is introduced.

## Additional pure APIs

`freezeTrialSnapshot(plan, data)` returns a deeply frozen, detached `{contract: B15-protection-v1, plan, data}`. This is an in-memory domain value. Server inputHash/snapshotHash, optimistic revision, permission and persistence checks stay mandatory.

`resolveTrialCandidate(original, candidate, 'keep'|'discard')` returns detached `{decision, original, retained}`; keep chooses the candidate, discard chooses the original. It never overwrites confirmed plans, data stores or caller objects. No automatic promotion/publication.

`trialInputIssues(current, proposed)` composes existing protected fact/source/material/order transitions and normal execution/event validation. Existing conservative rebase restrictions stay effective; no unknown original09 BOM or partial resource semantics are inferred. Apply normal rules and admission checks afterward.

`checkProtectedTasks(beforePlan, candidatePlan, currentData, {locks, protectionUntil})` accepts existing taskId-keyed `{start,end,machine}` locks. It checks exact locks including missing/duplicate tasks, completed original intervals/device, started accepted remainder positions, paused no-resume, and explicit protection cutoff. Equality at the cutoff is legal. Missing active projections are only accepted as handling-required when the candidate retains the exact fact, device protection and explicit risk. The result contains `valid`, `issues`, `handlingRequired`, a detached `locks` copy and `requiresResourceVerification: true`. **valid means protection passed only.** Never substitute it for full independent machine/calendar/precedence/personnel/tool/material/delivery verification. Error codes: B15_LOCK_CONFLICT, B15_COMPLETED_FACT_PROTECTED, B15_STARTED_TASK_PROTECTED, B15_INVALID_PROTECTION_WINDOW, B15_PROTECTION_WINDOW.

## Dev-owned shared seams

1. `server/business.mjs` / React drag/lock: consume protection findings, preserve lock snapshots, show handling-required and saved bottlenecks; retain preview -> independent recheck -> explicit commit and immutable confirmations. The new API is not wired into these entry points by this task.
2. Input save/copy/trial keep/discard: maintain source raw bytes, BOM version/unit/basis, quantities, actor/revision/hash checks and actual persistence. The new snapshot helper does not implement these application transactions.
3. `server/planner.ts` / Worker entry: preserve existing historical N06 source facts; do not rederive resource usage from new personnel profiles. Call protection validation alongside actual constraint checks. Final main must include verified B09 and PM-reviewed B12 as appropriate; this branch neither incorporates nor validates B12.
4. Full19 original CSV import/query/edit/error location, whole API identity/permissions, drag UI, final combined app Worker/store/native export and final fixed QA candidate remain Dev's B15 #40 responsibility. This task checks only applicable existing internal API/Worker/persistence seams with synthetic test identities.
5. PM verifies source and evidence, records source -> main SHA/parents/conflicts/impact, and dispatches QA when its exact entry dependencies exist. B09 UAT09 goes first; B12 main/QA dependencies remain. Test2 stays paused. No publish/deploy or edits to QA's prior environment.

## Reproduce

In the isolated application container: `B15_PRODUCT_SHA=<source40> sh qa/b15-test-run.sh`.
It installs into the disposable validation copy, builds the actual server/Worker, tests core/negative/domain Worker/application Worker/internal API/process restart, and emits compressed original JSON evidence. No live datastore is touched.

UAT15 uses an explicitly supplied N06 historical shared-resource mock (with original snapshots/quantity/source/adoption/release), completed A0-30/30-60, B expected supply usable180 and group/pool1->2. UAT17 reuses the existing fixed kg five-operation R4 model with fixed120 heat and configured60 delivery wait. UAT18 uses explicit normalized BOM650->700 per1000kg, yield0.96/order240, complementary FAT150->100 to preserve total1000, fixed30->40, continuous factory window60-480 and explicit resource claimG01->G60 usable130. These are replaceable mock values, not imported original09 mappings or new approved product defaults. Full original v0.3 scene bytes are packaged separately with hashes.
