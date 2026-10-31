# UAT03 isolated entry

This QA-only child of product `833b3d56929f88c9521cb64765066eece9f83879`
adds no product files. The current task covers UAT03/AC06 (single-set subset)
and AC17, not UAT04/06/07/08 or full R2.2 acceptance. QA UAT is a separate decision.

`uat03-entry-host.mjs` wraps the real existing B2 host, real business router,
root React, Worker and on-disk store. It verifies every original product file
against an independently generated Git source manifest before starting. The
QA wrapper has separate hashes/commit; `/api/uat03-build` reports both, plus
build, replaceable fixture, live input/config fingerprints and synthetic roles.
The same-origin proxy translates the trusted local Origin to its internal
loopback address. It does not rewrite foreign origins.

Roles: `/qa-role/planner`, `/qa-role/supervisor`, `/qa-role/query` set only a
synthetic QA cookie. `test-sub` headers also select these isolated actors.
These are not customer accounts or production identity tests.

Original UAT03 files remain byte-identical. `CONFIG.json` lists explicit
repairs, mapping tables, supplements and CR adoption. Required simulation
choices are no split/formal/active orders, READY original05->runtime mappings,
per-batch whole-task claims, enabled MACHINE/PRECEDENCE/CALENDAR/MOLD and
explicit CR-DEC02-03-v1 adoption. LABOR/MATERIAL and later rules stay disabled.
Source quantity, acquisition/release offsets and resource capacities come from
original05/12. Never reinterpret simulation as customer defaults.

Use the normal batch importer to load the nineteen original numbered CSVs
(excluding 00) plus the supplied supplemental CSVs. Fill original17 row2/3
no split/formal/active; explicitly select the effective CR contract, preview,
then commit. In tools select A+B, range0..600, preview then start Worker.
A/B FILL use FILL01/FILL02 and one G01. Check all enabled constraints and complete
four-task coverage. B must wait for A release; the reference arrangement is
only one legal answer. Preserve source, saved input and native exports.

Run `uat03-entry-browser.mjs` inside the isolated application container, with
`UAT03_EVIDENCE`, `UAT03_DATA_DIR`, `B2_INPUTS`, optional `UAT03_URL` set. It runs
new UAT03 UI coverage; it does not run historical B2/B231/B234 test suites.
The illegal diagnostic copy is explicitly labeled, not a Worker result or
product FAIL. AC17 must display its G01 overlap45..60, demand2/capacity1,
select both tasks and navigate to frozen claims and back to the same task.
The legal run and its source remain intact. `UAT03_RESUME=save` skips completed
import/Worker/source assertions after a harness selector failure, reusing their
persisted original evidence. Fresh execution needs no resume flag.

`UAT03_REOPEN=1` checks persisted legal run/reopen/native resource export after
an actual host process restart. It does not recreate or reschedule that run.
Use the snapshot/report's old/new container StartedAt and PID evidence to
establish process restart (PID may be reused across container namespaces).

Run `python3 qa/uat03-entry-oracle.py <evidence-tree>` with Python standard
library only. It parses raw CSVs and Fraction arithmetic/event endpoints,
checks old same-SHA evidence and the new UI result, validates source/config
provenance, all enabled constraints, complete coverage, exact resource ledger,
exports, alternate feasible schedule and seven rejecting mutations. It imports
no product planner, adapter or verification code. See delivered runbook for
exact image, mounts, commands, hashes, endpoint and current saved run IDs.
