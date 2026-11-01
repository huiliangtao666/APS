# CR-PARAM-UI-20261101 r1 · Issue45 implementation

Authorized by the user's explicit request, registered by APS-PM at
https://github.com/huiliangtao666/APS/issues/45#issuecomment-6552599688.
Original implementation delivery: dlv_ff9a5ac0-63af-4363-b60e-3ec23f492725.
Fixed design: b13860914439c43801eab1e10b42a5552821afe1,
`docs/requirements/proposals/CR-PARAM-UI-20261101/r1` (all 14 published assets).
Product version is the commit containing this document; design and product SHAs are distinct.
This document records implementation and its limits, not QA acceptance or a replacement status ledger.

The existing workbook store remains the source of dataset versions. The shared configuration
page and the six step editors call the same parameter query and mutation routes. Existing
workbooks continue to use their original parser, formula allowlist and source profile. An
11-sheet parameter workbook adds separately classified CP definitions, SP categories, PA
instances, discussions, questions and reference material. Uploaded K–O metadata cannot change
the fixed runtime contract. The server requires literal values, object references, units,
nonempty half-open periods and a current expected dataset version. A failed validation or
conflict leaves the dataset state unchanged. Import idempotency distinguishes candidate
storage from explicit dataset adoption. The original business workbook source hash survives
parameter enrichment; each parameter source keeps its own file hash.

UI entry: Input Data → select a dataset → Configuration Parameters. The scheduling workbench
also exposes “Excel 六步工作台与就地参数”. A1–A6 preserve the component's dataset, demand,
date, filter and local draft state. A1/A2/A3/A5 show the same editor restricted by fixed
step mapping; A4/A6 show a run's frozen parameters when a run is selected. Relationship
configuration opens the existing business table inline, with server validation and the same
expected-version mechanism. Derived/system entries are read-only and link to source tables.
The 168 CP definitions retain their original 16 domains and map to nine topics. Query supports
CP/PA, object, domain, topic, date, status, scope and pagination. CSV configuration export keeps
identity, unit, period, scope, dataset version and source. It is distinct from frozen run export.

`/api/workbooks/datasets/:id/parameters` GET/POST is shared by both entry points.
`/parameter-trials` creates an explicit isolated context owned by the existing actor key;
`parameterScope` on a run selects it. Shared base records and trial overrides have different
identities. An explicit numeric zero is a value; clearing an override restores shared
inheritance. All writes use the application's existing `permission('edit')`; exports use
`permission('export')`. No new identity, approval or external dispatch system is introduced.
The shared deployment still represents its shared actor, not a named human.

PA is a record identity, CP a semantic definition and SP a classification. CP063 is an alias
of CP074 and both edit the same inspection source. CP018 checks the box/piece ratio without
rounding it to an integer. CP080 retains the declared lead source; no missing route is turned
into zero. CP091's composite candidate validates positive rate separately from efficiency
in (0,1]; its efficiency bound never limits a rate of 50. Negative temperatures are valid;
capacity and durations use their own contracts. No all-168 mandatory list or unselected
random scenario requirement is introduced. Standard shift denominators must be positive;
zero actual shifts remain valid in factory calendar rows.

New opted-in workbook runs freeze their selected scope, effective day, actual parameter
records, applied field values and source hashes before Worker creation. The Worker and
independent verifier receive the frozen dataset. Parameter edits invalidate readiness; old
run objects are not rewritten. New-contract plans constrain each task by both equipment
capacity and the actual selected tool count/capacity; equipment600 and a single tool500
retain their own values and yield at most500 per task. Old profiles and old native exports
remain on their original contract. Existing qualified-output Excel BOM semantics and the
separate standard-input loss model are retained; no new double deduction or silent model
migration is introduced.

## Concrete remaining work and verification limits

The source candidate provides the shared infrastructure and mapped original numeric workbook
parameters. It does not establish full PCU/UAT completion. The root delivery matrix distinguishes
pure-domain and in-process route checks from actual HTTP, UI, Worker, frozen native export,
full private workbook import and standard build. In-process route tests inject a test permission
adapter and do not prove deployment authorization. No deployed environment is updated by this
source change.

The following are still engineering coverage gaps, not new business approval requests:

- Standard-input loss parameters use the existing `/bom-loss` source through the same
  `BomApplication` component in both entries, with explicit standard-input shared/plan-trial
  scope. They remain separate from an Excel qualified-output dataset. Trial edits are
  versioned and owned; shared state and other plan snapshots are unchanged. Full real
  Worker/UI verification of this new trial path awaits the coordinated window.
- CP091 composite rate/efficiency and compound controls not represented by current workbook
  atomic fields remain candidate records; their existing non-workbook engines are not unified
  by this source candidate. Arbitrary scalar activation is rejected.
- Factory and crew rows remain distinct sources. New-contract daily availability intersects
  factory actual/standard counts with the crew's weekday/Sunday ratio, without multiplying
  the same ratio twice. A factory date exception or crew actual0 closes its availability;
  neither changes a positive standard denominator. Real UI/Worker verification remains pending.
- A single frozen run currently resolves parameter versions at its selected effective/start
  day. Automatic changes inside that run across another parameter period are not implemented.
  Cross-period new runs can select the corresponding version. Do not describe this as full
  time-varying adoption.
- Configuration CSV and OOXML exports are available. The OOXML template/export round-trip
  retains record identity, unit, period and scope, with import version checks and explicit
  candidate/adoption mode. Full original workbook/actual UI transport remains unexecuted.


D14–19 new formulas, finished-product release days, automatic supplier choice, candidate
K–O policies and P1/D3 remain unimplemented unless their original contract was already clear.
No speculative defaults or product FAILs are created from Q03/Q05/Q10. Q03's longest path13
and window14 remain unchanged. The remaining original IN/FR/CR responsibilities stay on #45.

Self-test commands (inside the app container, no application start):

```
python3 qa/parameter-ui-fixture.py /workspace/temp/parameter-ui/fixture
python3 qa/input-data-upgrade-supply-fixture.py /workspace/temp/parameter-ui/fixture/supply
PARAMETER_FIXTURE=/workspace/temp/parameter-ui/fixture node --max-old-space-size=64 --test --test-concurrency=1 qa/parameter-ui-core.test.mjs qa/parameter-ui-routes.test.mjs
```

The small fixture is explicitly synthetic: 11 sheets,168 CP,2 SP,2 PA,1 D,1 Q. It must not
be reported as the original11/168/38/3428/19/12 private workbook test. Source hashes and
all raw self-test logs belong in the root delivery evidence, not in an evidence-only commit.

## Original package continuation · dlv_d56838b8

This source continuation retains the same 20 PCU / 35 IN / 67-row responsibility matrix.
It does not close the package or replace the earlier fixed-SHA evidence.

The two main navigation entries now keep one workbook workspace mounted after its first
use. Changing entries or viewing a frozen run keeps its local selection and drafts. Parameter
and relationship drafts are retained per dataset/table in browser memory; changing dataset
cannot submit an editor against another dataset. A pending parameter save protects the dataset
selector. Cancel restores the opening control's focus where that control is still present.
Version conflicts retain the original expected version and show an explicit comparison/retry
action. The A2 parameter issue link opens the affected record search. Object/status filters,
imported definition text and shared/override/effective sources are visible. Searching CP063
also finds the canonical CP074 instance. A1 exposes the actual selected window length; saving
an effective global start/window parameter updates the corresponding current selection.
Standard-input loss maintenance stays in its own persistent editor and its explicit scope.

New-contract datasets retain literal business-field baselines separately from effective
parameter resolutions. Resolving another date or removing the last trial override restores
that baseline, including when there is no shared parameter record. Direct maintenance of an
unbound business field updates its baseline. Existing immutable run snapshots are never
rewritten. Runtime provenance now includes effective global controls and units as well as
applied table fields. Paired waiting/temperature bounds are checked at parameter period
boundaries and in trial scopes, rather than only at day0.

Parameter imports reject duplicate PA identities and inconsistent explicit CP mappings.
Composite candidates receive period/value validation; unsupported composites stay candidates
even when an import requests adoption. An existing PA cannot be relabelled across candidate
and adopted storage. Candidate-only validation does not substitute proposals for active
business constraints.

`qa/parameter-ui-continuation.test.mjs` contains small pure contract regressions using only
Node built-ins. `qa/parameter-ui-http.test.mjs` is the prepared real HTTP/import-child/serial
Worker/persistence/native-export/production-CSRF scenario. The latter deliberately requires
`APS_PARAMETER_RUNTIME_WINDOW=approved`, `PARAMETER_RUNTIME_ROOT` and `PARAMETER_FIXTURE`.
It must be run only inside an explicitly coordinated window, using an owned isolated state
directory. Its shared-access checks prove shared access and CSRF behavior; they do not
establish a named human role or managed deployment identity. Browser dual-entry operation,
standard build, full private workbooks and package acceptance remain separately required.
