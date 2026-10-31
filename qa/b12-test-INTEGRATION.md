# B12 APS-Test domain development

Delivery dlv_eccbf433-46fc-4696-ab37-76817c015055:r1.
Dispatch event b12:joint-domain-development:20261031:r1:APS-Test.
Start 12d453d7cb03829dc609115e48c5e4c19af4a6ec; branch
test/b12-process-core-20261031. Project2 / Issue39 only.

The existing R4 kg/fixed-time sequential route remains the calculation model.
Only the configured heat operation aggregates production identities. Cooling
loads use qualified output; all programs retain full fixed duration. Search now
uses the intersection of all heat-member windows, so a later feasible common
window is considered before splitting the group. Exact capacity, calendar,
pending material transactions and all enabled resource checks remain active.
The direct domain path refuses unsupported speed/time modes instead of using a
fixed number accidentally. Negative remaining order quantity is rejected.

New task.processSources contains frozen sourceRefs (table,row,occurrence), not
invented original CSV lines. Missing tasks have a separate finding per operation
with orderId/productionBatchId/operation/machineId and actual taskIds, allowing
the existing resourceTaskSources context path to read missing task resources.
verifyProcessRoute preserves problems:string[] and adds findings with explicit
task/source associations. A missing operation without a stated reason is a
problem; a well-explained incomplete plan remains partial, never complete PASS.
No scheduler/proposal/allocator is imported by this independent route checker.

Dev owns the shared integration: consume checker.findings instead of rebuilding
empty taskIds from problems; bind processSources to the frozen input/sourceMap
and verified CSV provenance in the task detail. Do not guess physical CSV lines.
Integrate B09 final material code, then validate the final combined Worker/API,
UI, native export, input mapping, save/reopen/restart and immutable history.
The pure proposal remains integrated=false. The task-level module Worker is not
an application Worker; existing R4-07 exercises the actual application Worker in
an isolated private fixture. Existing R4-07/11 targeted API/permission/restart
checks are reused, with no duplicate Dev full browser matrix or QA environment.

Replay from an unbound isolated copy using official app-exec --validate:
B4_INPUTS=/workspace/temp/b4/inputs B12_OUT=/tmp/b12-core-output bash qa/b12-test-replay.sh
The controlled B4 originals must be supplied read-only. Optional absence uses
labelled synthetic fixtures. New complete-route scenarios use the explicit R4
mock (normalized orders, effective BOM version/date and PACK fixed50), not a
claim of original nineteen-file admission. The copied manifest SDK paths are
adjusted only inside validation, never in tracked package files. The compressed
evidence line carries output back before the temporary directory is removed.
Use qa/b12-test-oracle.py with decoded evidence on Python3 for independent
source/Fraction/event-sweep checks.

A stale legacy FR021 test expects MAX_LAG to say "not implemented", although
R4 already implements the bounded pair model. It is excluded by explicit test
name in this replay; B12-10 instead proves undeclared MAX_LAG/STORAGE refuse with
zero tasks/reservations. All thirteen other batch cases are run unchanged.
Historical results stay on their original SHAs; this is not a new QA defect round.

WAIT_APPROVAL: cross-batch packaging rounding, nonkg production granularity,
arbitrary load nodes, general regrouping and new tail adjustment semantics.
PACK effective speed/unit/efficiency and directional changeover/cleaning beyond
this existing fixed model remain explicit residual responsibilities for PM/Dev;
no formula or customer default is invented. DEC04–06 applications and B02 global
preallocation remain unauthorized. Source domain completion is not whole Issue39
Done, QA UAT PASS, main integration or publication. Dev serially integrates main
promptly under the latest user authorization and records source/main parents,
merge-base/conflicts and affected checks before PM fixes the QA candidate.
