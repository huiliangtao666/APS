# B2 resource scenario work package

Executor APS-Test; event_key `dlv_8dd441d1-12f3-4231-80bb-58e24a88be08:r1`;
dispatch key `b2:uat03-04-06-07-08:resource-integrated:20261031:r1`.
This is development and task self-test. PM controls original cards; QA controls UAT.

`ResourceWorkbench` is mounted by the existing resource `DataEditor`, so the B2
implementation does not edit B1's App/import/business/run-input files. It uses
the existing atomic input API, zero-write preview, frozen Worker runs, immutable
original inputs, resource checker and scoped resource export. There is no second
configuration store. Draft changes block the workbench's calculation until saved
or cancelled. Changing order/window/config revision invalidates the preview.
Every result is reopened with its own run/input/plan identifiers and fingerprints.
Clicking a resource row filters the same tasks and displays their frozen input
records, separating canonical row positions from actual CSV physical lines.

The integer event oracle in `b2-oracle.mjs` is independent of the scheduler,
staffing allocator, resource checker and load projection. It verifies every
event interval, group and physical pool capacity, machine overlap and precedence.
Tests also force directed substitution, disable it, test reverse rejection,
preserve same-skill matches, compare whole/window occupation, sharing/retention,
quantity shortages and atomic rejection. Original UAT07 minutes 60 and 70 are
09:00 and 09:10 on the original fixed axis.

## Reproduce

Use the committed branch SHA and a clean checkout. Obtain `B2-RESOURCE-INPUTS.zip`
from the APS-Test delivery and extract it to a local QA input directory.
All files are simulated v0.3 source samples; the seed is
`B2-20261031-explicit-v1`, no randomness. `b2-fixture.mjs` records every explicit
supplement: order status/type/split values, named shift, stage/window/pool mapping,
source selection and units. These choices are QA data, never customer facts or
production defaults. The adapter is QA-only; passing it does not mean the raw
original19 production import passed. That path is probed and recorded separately.

Run on a VM host with the existing QA image (image digest is in the evidence):

```sh
B2_REPO=/absolute/checkout B2_INPUTS=/absolute/inputs B2_OUT=/absolute/new-evidence \
  bash /absolute/checkout/qa/b2-replay.sh
```

For interactive review, execute **inside an isolated Node22 app container** with
dependencies installed there, from the checkout:

```sh
B2_DISPOSABLE_QA=1 B2_DATA_DIR=/absolute/empty-qa-store \
B2_INPUTS=/absolute/inputs B2_SCENARIO=07 \
node --experimental-strip-types qa/b2-host.mjs
```

It prints a loopback URL, serves the real root React application, preserves the
isolated store across process restarts and uses explicitly synthetic planner,
supervisor and query members. A nonempty unmarked directory is rejected. It is
never imported by production. The CLI is a local review environment, not a
published or shared Portal endpoint; forwarding must be coordinated by PM.
No formal customer identity or production SSO is claimed.

## Boundaries

H-P04 personnel occupation outside the selected participation window is BLOCKED
pending the user's formula/field/availability-order decision. N06 real customer
execution/resource ledger is BLOCKED pending original data. Neither is filled
with simulation. DEC04/05/06 application functionality is excluded.
Old PASS remains on its original SHA. No main merge, publication or timer change.
Final delivery records the pinned B1 source, both integration parents and affected
self-tests; a moving/unaccepted B1 source prevents QA-ready/task-Done claims.
