# Issue3 H-P04 / N06 stage implementation

Authority: APS-BL-001 v0.3 + effective CR-DEC02-03-20261029 and user decision
https://github.com/huiliangtao666/APS/issues/3#issuecomment-6538271182.
Delivery dlv_7059d3b0-0d2a-4ff2-b792-46705063e713, result r1.
Exact source/parent be88f073b4c2597abcd3e5533e92f7f94a89ad59;
isolated branch dev/issue3-hp04-n06-20261031. No changes to APS-Test UAT03.

H-P04 extends the existing dependency editor/CSV/API and staffing allocator.
Each dependency explicitly defines order/operation/post/phase scope. Choose
`人员占用基准` as `参与窗口` or `完整工序`, choose one of the two displayed
`人员检查顺序` values, and supply `提前占用分钟`, `后延占用分钟`,
`人员配置来源`, `人员配置版本`. New fields have no suggested defaults.
Actual occupancy is [base start - before, base end + after). Existing pool-level
whole-operation retention and dependency `窗口外释放=否` still apply. Both
orders finally require the full actual occupied interval within group availability,
a single factory shift (minus stops), matching skill/shift, group capacity and
unique physical-pool capacity. Availability-first actually prechecks the base
before expanding, then checks the full interval. Occupation-first expands before
availability checks. Neither order clips exterior minutes or relaxes capacity.
The independent frozen checker reconstructs the formula without the allocator.

Legacy saved rows with all four new fields blank and old pre/post fields empty
or exact `0` retain their previous participation-only meaning. They are labelled
as legacy and are not evidence of configured H-P04. Nonzero/invalid pre/post or
any new field activates validation: incomplete scope/order/minutes/source/version
blocks; values are never inferred. Existing input bytes and historical plans are
not rewritten. Old dependency CSV headers remain accepted for this legacy path;
explicit H-P04 requires the new values. The main task display and resource panel
alert when a personnel reservation extends outside a task and show full intervals,
policy source/version and conflict/shift reasons. Plan and resource CSV exports
retain actual reservation intervals and policies.

N06 adapts the existing finite ledger source cd115f077593cb4c1fc991cbaf54053e305e03ee
and the ea1338 design, under distinct modules `execution-resource-ledger` and
`verify-execution-resource-ledger`. There is no merge/cherry-pick and no reuse of
the raw05/06 module or `originalResourceContract` fields. New freeze fields are
`executionResourceContract`, `executionResourceVersion`, `executionResourceKind`;
raw05/06 source/version mapping continues independently.

The stage accepts only explicitly simulated sources and `MOCK:` ledger IDs.
`37_MOCK资源事实账.csv`/the existing editor saves events with stable event ID,
ledger ID, prior-event ID, type and structured document. Each checked document
requires original fact/task/batch/member links, complete positive/negative adoption,
physical identities/current aliases, actual quantity/unit/acquire and release,
historical personnel skill/shift/pool mapping and rule snapshot, sources with
kind/domain/version/record/location/SHA256/provider/reviewer/occurred time, scope,
responsible party and reason. Register, full release and correction are append-only.
Duplicate/stale/fork/deletion/reorder are rejected atomically; identical retries
reuse the event ID. Corrections replace the effective view, never sum old revisions.
Actual physical acquisitions debit once even with multiple original members.

Unknown releases/drafts can be stored as such but block calculation; no H, task
end, remaining duration or zero is supplied. Runtime support is the existing
finite, fully released, completed historical-task slice with explicit source
mapping and new future work at/after observation. Original protections include
unselected orders; future resources compete with retained historical intervals.
Historical actual excess is preserved rather than edited away. Unsupported active
remaining-stage anchors, repeated/partial acquisitions, unknown release, combined
batch process/execution recovery remain explicit guards. No site ledger ingestion,
attendance integration, dynamic downstream release or new business defaults.

Sources, append-only events, source versions, physical protections and configuration
are frozen with the run and input hash. Independent verification reconstructs
original protections and checks future capacity against them; it does not call the
scheduler or ledger projection. Confirmation/restore already use the extended
execution-state hash, so new actual corrections invalidate stale decisions without
rewriting old runs. UI distinguishes current and frozen mock ledger; native CSVs
carry mock label, events, source versions and protections. Existing permissions,
operation reasons, trusted actor and revision/history store apply.

Validation commands run inside the official isolated application container only.
`qa/hp04-n06-replay.sh` runs build/core, targeted unit/API/Worker/CSV, process restart,
root React/native download and B234/R4 affected regressions. Supply untouched
original B2/B3/B4 input directories and fresh output directories; numbers in QA
fixtures are explicit synthetic premises, not product suggestions or customer facts.
`qa/hp04-n06-oracle.py` independently uses Python CSV/JSON/Fraction, without importing
product code, to check intervals, sources, capacities and historical exports.

No business data migration. Roll back by building the exact parent in an isolated
checkout and preserving current data; parent does not implement the new ledger,
so retain event-bearing inputs read-only for forward replay. Never delete events
or downgrade frozen snapshots to simulate compatibility. Old PASS remains on old
SHA; this development task cannot close whole FR/Issue, FR017 historical Done,
UAT03, customer-fact adoption choices or QA UAT. PM owns remaining original-card
reconciliation and scenario entry; QA owns any subsequent UAT verdict.
