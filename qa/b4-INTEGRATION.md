# B4 process/cooling handoff

Dispatch `dlv_d39b11cf-1a90-453a-bcbe-07e4d19b5548`, result event
`dlv_d39b11cf-1a90-453a-bcbe-07e4d19b5548:r1`.
Dispatch event `b4:uat12-13-14-17:process-cooling:20261031:r1`.

Base B2 `9aa7f785a7783211835d2654449093a79a2093dd`, direct parent
`c4bbd37d5be6d3b9195870af9851cd2462bd401b`.
B4 changes only new process/cooling modules, adapter, unit tests and QA instructions.
No existing material, App, DataEditor, import, run-source, planner or capability
file is edited. No main merge or publication.

## Executable scope

`prepareCoolingMembers` consumes existing tables plus already established exact
production records `{id,orderId,unit,inputKg,qualifiedKg}` and validated upstream
tasks. It selects the unique explicit maximum-wait successor of a configured
batch-processing resource, never operation names. It rejects nonkg, arbitrary
load nodes, missing upstream/BOM versions, ambiguous routes, unsupported release
offsets and conflicting declarations. Its input/output check is exact.

`scheduleCoolingPairs` proposes resource batches for that pair only. Heat uses
BOM total input and fixed program time; cooling uses qualified output and full
half-open occupation. It checks machine windows/downtime, shared space, earliest
upstream completion, horizon and maximum wait together. It shifts upstream heat
when downstream availability would violate the wait. If simultaneous cooling
cannot fit within the wait, it retries smaller heat resource groups without
altering production IDs/quantities. Under-min tails are reported, never filled
by extra production. Candidate search is bounded, with no global-optimum or
global-infeasibility claim. Inputs and preexisting reservations are immutable.

All results explicitly say `scope=process-cooling-only, integrated=false`.
They do not represent all enabled constraints or a delivery commitment.
Existing global MAX_LAG/rule, result and delivery guards are preserved.
No DEC06 parameter, formula default, tail policy or generic stage regrouping
is introduced. The resource-pair grouping is the exact v0.3 UAT13/14 exception
authorized in this dispatch, not a general per-stage regrouping implementation.

## Precise integration seam — PM-named single integrator required

The default planner remains unchanged. PM must name one integrator after B3's
fixed handoff; the worker must not concurrently patch the planner. Use a new
integration branch, record B2/B3/B4 SHAs and parents, merge/cherry-pick with
conflict records, then freeze and test a single combined product SHA.

1. Preserve B3's material changes and B2's original-source/resource mappings.
   Establish individual production batches from accepted BOM/unit/splitting
   contracts. `prepareProductionBatches` currently groups an entire route and
   rejects cooling/packing output load bases. Its whole-route groups cannot be
   used as heat-ready members: retain production records, and schedule upstream
   operations individually before attempting the configured pair.
2. At `server/planner.ts`'s batch preparation seam (current call to
   `prepareProductionBatches`) separate immutable production identities from
   resource groups. Once predecessors of the pair are validated and scheduled,
   call `prepareCoolingMembers({data:sourceData,productionBatches,upstreamTasks,
   startMinute,endMinute})`. Any findings remain explicit blockers.
3. Translate preexisting machine/space reservations to
   `{resource:'machine:'+resourceId|'space:'+resourceId,quantity,start,end}`.
   Call `scheduleCoolingPairs({members,reservations,endMinute})`. The result's
   `tasks`, `groups`, exact masses, task-linked reservations, attempts and
   findings are the staging proposal; do not immediately append them to Plan.
4. In the existing joint-candidate loop, preview B3 material, personnel,
   tooling and every enabled condition for **all** shifted heat/cool tasks,
   including the pending proposal's reservations. Re-evaluate active BOM at
   actual feed minutes after every shift. If a material/version/time condition
   changes, rebuild quantities/compatibility and retry the complete proposal.
   No old material preview token or allocation survives changed timing.
   Stage material deductions against a private allocator copy/transaction:
   previews for multiple tasks must see each other's pending deductions.
5. Commit the entire accepted pair atomically, or discard all pending machine,
   space, material and personnel state. Schedule downstream operations only
   after this commit. Fixed program duration is not scaled with group load.
   Keep task resource-batch identity only on the heat operation. Do not expand
   every route step through the old `batches.expand` resource group.
6. At `setActivePlan`, `batchSummary`, result assessment and independent
   verification, keep per-production input/output amounts and heat-only groups.
   Global `MAX_LAG` capability must remain off until the real Worker and
   independent checker both enforce all applicable route wait assertions.
   The legacy delivery `MAX_WAIT_UNRESOLVED` guard must not be removed by a
   client flag or by this proposal's contract string. Lift it only after the
   trusted integrated checker derives complete coverage from frozen inputs.
7. Original09/12/17 contracts and explicit 05/06 choices need B3/B2 admission.
   Original PACK is `按支数`, not a positive fixed time; implement only its
   approved effective-speed meaning, or use a separately sourced explicit
   simulation time50 for a clearly labelled fixture. Do not infer efficiency,
   arbitrary rounding or customer defaults. Raw original import remains a
   separate assertion; explicit simulation supplementation is not raw PASS.
8. On the final combined SHA rerun B4 core/grid/mutations, B3 material affected
   tests, B2 shifted resource/wait/source assertions, then actual original/
   configured import -> application Worker -> independent full-route checker
   -> native React -> save/reopen/restart/export/history/roles/atomic rollback.
   Verify UAT12 wait<=10 with upstream change; UAT13 500 input and 480 output
   simultaneous; UAT14 no simultaneous480 in400 and legal split heat. Accept
   other legal schedules. UAT17 is later R6: explicit fixture reference has
   route290 + wait60 =350, minute350=13:50, delay260 against due90; it is not
   a current R4 closure gate or proof of a real delivery promise.

## Reproduction and evidence limits

With extracted untouched original UAT12/13/14/17 folders:

```sh
B4_REPO=/absolute/clean-checkout B4_INPUTS=/absolute/original-inputs \
B4_OUT=/absolute/evidence bash qa/b4-replay.sh
```

This uses the existing isolated application image, network disabled, and copies
the readonly source into the container. No host dependencies/server are started.
Ordinary `npm test` also works without the original files through a deliberately
small self-contained synthetic unit fixture. It adds no production default.

Unit tests cover 42 combinations and 15 output mutations with an independent
rational/event-sweep oracle. The module Worker, JSON roundtrip and unit export
checks are explicitly not the production application Worker, persisted Plan,
native CSV or UI positive chain. The real API is separately probed with the
four original19 batches and MAX_LAG enabling: invalid previews have no token,
forged commits fail, and persistent business bytes remain unchanged. Those
probes demonstrate the integration gap and safe admission, not full scenarios.

Cross-batch packaging rounding, nonkg granularity, arbitrary load-node/stage
regrouping and tail adjustments remain exact BLOCKED on Issue16. Other existing
H-P04/N06 conditions retain their original status and repair counts. Only real
product FAIL can increment the original maximum-two-round limit. This package
does not close original cards/Issue or provide a QA UAT verdict.
