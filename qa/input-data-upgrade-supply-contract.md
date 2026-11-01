# Issue45 supply application seam

Authorized delivery: `dlv_cc92391b-c314-412a-b178-ae09dc521dfe`, dispatch `input:supply-draft-core:maina084f3e:20261101:r1`.
Base main: `a084f3e7392d80634f0a44b6fefae993b966d849`. Approved design: `13e2eeed4438cb0b200db9c4de3781c7f1248be3`, IN-22/24/25/28; consolidated business SHA256 `d7a86d463b9e8003e9860b3f55e3d7d8e0ec408710647f74a62964500c3f98f8`.

Dev owns workbook-supply/drafts/router/runtime/plan, WorkbookDrafts/InputData and this supply-prefixed QA. Test-owned parse/model/import-worker/relation-validation are unchanged. Their functions and return shapes remain compatible. `supplyReadiness` extends application summary/run/calculation readiness; raw incomplete WIP can be imported and maintained but cannot run. It does not edit old snapshots or the legacy minute planner.

`POST /workbooks/datasets/:id/draft` retains its endpoint. Copy requires sourceRun/suggestionId, expectedVersion and explicit currentDay. Only quantity/relationId/orderDay/expiryDay/note may be changed. Existing action=adopt/void remains; no implicit adoption through edits. Repeating adoption/void returns idempotent without another version or audit write. Editing adopted input returns draft and requires another adoption. Void is terminal. Invalid changes and stale versions never commit. Permission checks precede idempotency. GET drafts accepts the existing version query; runs always freeze that version.

Transit uses the imported PO/line identity and inspection floor. WIP keeps its original source and existing remaining mapping shape. Missing material/operation arrays, resource facts or dates reject execution; an explicit empty remaining-material array is distinct from a missing field. Historical BOM relationships outside the remaining set are already netted according to the explicit source policy. Only remaining BOM quantities are consumed; current occupancy and remaining route resources stay finite.

Supply tests use a generated 16-sheet, about 10KB OOXML fixture with one WIP and two explicit BOM feeds: 10kg historical material already netted, 10kg future material, 10kg conditional WIP output. Original customer uploads and the full 8-WIP workbook are unchanged. Fixtures are replaceable simulations, not site defaults.

Run in an existing container, in a private directory with existing dependencies, serially:

```sh
python3 qa/input-data-upgrade-supply-fixture.py /tmp/aps-supply-core/supply-fixture
SUPPLY_FIXTURE=/tmp/aps-supply-core/supply-fixture node --max-old-space-size=64 --test --test-concurrency=1 qa/input-data-upgrade-supply-core.test.mjs
# Only after Test's #40 heavy window is explicitly released:
SUPPLY_FIXTURE=/tmp/aps-supply-core/supply-fixture node --max-old-space-size=64 --experimental-strip-types --test --test-concurrency=1 qa/input-data-upgrade-supply-http.test.mjs
node_modules/.bin/esbuild qa/input-data-upgrade-supply-ui.test.tsx --bundle --platform=node --packages=external --format=esm --jsx=automatic --outfile=qa/supply-ui-test.mjs
node --max-old-space-size=64 --test qa/supply-ui-test.mjs
```

The HTTP suite uses real product routes, parser/import child and calculation Worker, synthetic test actors, isolated disposable stores, saved/reopened frozen versions and native CSV. UI tests execute actual component event handlers and React rendering; they are not full browser evidence. Set SUPPLY_OUT to retain original results. Standard tsc/Vite, full workbook, whole Issue45 and QA/UAT remain separately gated. Do not publish, overwrite QA state, stop existing services, or repeat any new OOM.
