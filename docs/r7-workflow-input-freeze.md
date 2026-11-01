# R7 confirmation and input freeze implementation

Scope: Issue41, delivery `dlv_afbd7bab-7ee1-4a03-9f74-ce204a7d7fa5`;
APS-BL-001 v0.3 AC22/AC25 responsibility and approved CR-INPUT-DATA-20261031
IN12/13/30/31/34/35. This is an implementation companion to the unchanged
[original business contract](requirements/proposals/CR-INPUT-DATA-20261031/r1/01-业务需求与主程序接入.txt)
and [interface contract](requirements/proposals/CR-INPUT-DATA-20261031/r1/12-主程序接入业务契约.json).
Original input identities, design hashes and baseline remain authoritative.

The existing submit/return/confirm/archive, saved queries and native exports are
reused. A bounded kg process route now carries a structured absence cause from
the producer. A partial route can pass inspection of its scheduled subset only
when the independent frozen-source checker reports no problems and every missing
task has a saved quantity, unit and known reason. The API exposes
`coverage=known-partial` and the full missing task list. An explicit complete list,
partial acceptance and scope acknowledgement are still required on both submit
and confirm. Unknown causes, search bounds, conflicts, stale input/result/review/
workflow/submission, unchecked required constraints and modified snapshots block
the transaction. Complete routes retain `coverage=complete`.

Daily runs require a positive explicit dataset version. IDs must be unique and
belong to the chosen half-open day window; an empty demand selection is rejected.
The saved run records source file, mapping, configuration fingerprints and the
unchanged day/minute origins. Worker results must match that selection and source,
pass independent checks, and receive a saved result digest. Reads, verification
and export refuse a changed digest. Independent verification uses a clone of the
same frozen version with parameters effective at its selected start day.

WIP identity comes from the frozen WIP mapping, never an ID prefix. Remaining WIP
inputs are independently checked against their declared BOM quantities. The
checker also validates exact demand identities/totals and day/minute coordinates.
Existing historical records are not rewritten. Extra native provenance rows are
emitted only for new runs carrying this provenance contract; legacy export layout
is retained. No BOM profile or business formula is replaced.

The existing input and confirmation UI display completed/partial/failed and
unchecked separately. Import readiness is not represented as runtime success.
Frozen selections retain their own version/source download links after edits.
Planner/supervisor/query in tests are explicit simulation actors, not official
accounts or approvals.

## Bounded replay

Use an existing container with the repository and its existing dependencies;
do not install on the VM host, rebuild an image, or replace a fixed QA service.
Generate the fixture with Python in a disposable workspace directory:

```sh
python3 qa/r7-workflow-freeze-fixture.py /absolute/disposable/fixture
```

Then, **inside the application container**, from this repository:

```sh
R7_SMALL_FIXTURE=/absolute/container/fixture \
R7_CORE_OUT=/absolute/container/empty-evidence \
bash qa/r7-workflow-freeze-replay.sh
```

The replay starts actual HTTP routers and calculation Workers serially, retaining
raw persisted business/workbook state, frozen inputs, native CSV and observations.
HTTP listeners bind ephemeral loopback ports and close at test completion. It
adds no permanent service and does not change existing candidate environments.
Node parent/child/Worker heaps are bounded to 64MiB; import heap is configured
only for this fixture, leaving the existing standard default unchanged.

This replay provides task-level evidence, not a permanent QA URL. Standard
tsc/Vite, a newly deployed browser candidate, the full #45 workbook and the whole
P0/AC25/AC27/UAT remain separate unexecuted or capacity-dependent requirements.
The literal two-order kg and six-demand daily profiles are replaceable mock data;
they do not certify all manufacturing configurations or scale performance.
