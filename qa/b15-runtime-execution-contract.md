# Issue48 isolated execution mock

Authority: original Issue48 comment6556235075; dispatch
`b15:execution-protection-isolated-fixture:48e0766:20261101:r1`.
Test owns only `qa/b15-runtime-execution-*`. APS-Dev alone integrates main.
The candidate runs historical product48e0766, parent4bd4972, from existing
image220eed84228ea8d044009e628cf4b1692baf55db6d1636de9870bf2186fedd5b.
The tool commit is a separate source version and does not change that product.

The sole candidate is `aps-test-uat18-execution-48e-r1` at
`http://127.0.0.1:18301/`, published only on host loopback.
Use native host Chrome, as in the completed selftest. Role links:
`/__qa/role/planner`, `/__qa/role/supervisor`, `/__qa/role/query`.
These are explicitly simulated identities using real product permission checks.
This is not production authentication or a Portal publication.

The exact fixture is available at `/fixtures/execution/PROFILE.json`.
Original source and UI manifest is `/__qa/source-manifest.json` and original18
profile remains `/fixtures/18/PROFILE.json`. Runtime metadata is `/api/uat-build`.
Current input plus `candidate-access.json` in the Test result bundle supply exact
plan/run/trial IDs. Select the supplied independent trial in “方案副本与比较”.
For QA ownership isolation, copy its baseline plan to a new independent trial
through the product and run it with PROFILE.selection before negative checks.
Do not edit trial execution facts; that remains a409 rejection.

The input is normalized, explicit and replaceable. A and B both request100kg
HC40 with mock yield1 and LEAN1000kg per1000kg input. A-MIX is “已开始”, starts
and is observed at30, completed output0, explicit remainder20min, consumed40kg.
B-MIX is “已完成”, actual interval0–30, output100, remainder0, consumed100kg.
Both use MIX01 without overlapping actual intervals. Separate executionSources
map each original task and consumed lot. Stock balance is independently
`300 = 40 + 100 + 60 remaining planned + 10 reserved + 90 untouched`.
These numbers are not inferred customer facts, production defaults, qualified
stock receipts, or approval of additional formulas.

Rules enabled for this bounded execution contract are MACHINE, PRECEDENCE,
CALENDAR, MATERIAL. Fixed48e explicitly rejects combining these facts with
CAPACITY/PROGRAM/MOLD/STORAGE/DELIVERY or unknown personnel remainder semantics.
Existing UAT18 broader scenarios and their previous PASS remain on18253/54.

For both A-MIX and B-MIX, actual UI pointer/preview/lock controls must be disabled.
`GET /api/trials/:id/positions` must have `blocked:null`, both tasks `movable:false`,
and usable current revision/planId/planHash. Forged move-preview and lock-preview
with those exact current values must return409 `task_execution_protected`.
Record persistent-file byte hashes before/after every rejection, not merely a
matching semantic JSON object. Trial execution table editing must return409
`trial_execution_edit_forbidden`; query forged mutation403. No rejection may
append audit entries. Real export may append an authorized export record;
its CSV bytes and the frozen historical inputs must remain unchanged.

The own state mount is `temp/b15-uat18-execution-fixture-r1/state` at `/state`;
it began empty and is700. The own fixture mount at `/fixtures/execution` is
read-only. No legacy state or product directory is mounted for writing.
Keep this candidate and state for QA. Do not start another candidate, restart,
reload/hotreplace legacy services, remove containers/volumes, or publish.
Memory limit1GiB is a limit, not a reservation. Fresh startup>=1GiB,
browser>=640MiB, first running sample<256MiB/OOM/identity drift stops the work.
One browser/context and serial Worker only. Before any future QA run, PM must
coordinate the next window after Dev45 and require fresh identity/capacity and
no pending Worker; this document does not claim ownership of that future window.

The first logger exception and the rejected unsupported BOM note were stopped
before any business state was written. Corrected own tools resumed the same
empty instance after fresh gates. No source protection was bypassed.
The completed browser run passed; a final Python text comparison normalized
CRLF and falsely rejected byte-identical CSVs. The corrected binary comparison
was replayed against both retained API responses and the actual UI download,
without another browser/runtime run. Exact failed-run tools remain in evidence.
These are tool/fixture corrections, not product defects or product repair rounds.
