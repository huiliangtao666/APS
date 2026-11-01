# IN04/05/06/17 integration contract

Dispatch `input:atomic-import-guards:main5c12845:20261101:r1`; original delivery `dlv_75dcae95-7911-46f9-bcc2-7f7b96440719`. Current owner of all four assertions: #45; old IN17 CSV owner #39 remains historical.

`parseWorkbook(buffer,schema)`, `refreshDerived(dataset,atDay)`, `validateWorkbook(dataset)` signatures and existing return shapes remain compatible. The new pure `workbook-relation-validation.mjs` is imported by model only. No new business formulas/functions. Existing SUM/MAX/IF/ROUND/ROUNDUP whitelist remains unchanged.

Parse issues add optional `record` for identity navigation. BOM_CYCLE issues add optional `chain` and `relations`; BOM_VERSION_OVERLAP adds optional `relations` and `overlap:[start,end]`. Each relation includes record/version/row/cells/parent/child/effective/expiry. Existing code/severity/sheet/row/record/field/cell/message/remedy remain. All date intervals are [start,end), as controlled input contract section 4 specifies.

Parameter bindings retain `{sheet,row,field,parameterId,recordKey}`. Column order is resolved through Chinese headers, including the parameter identity/value columns. Formula cells in parameter values are forbidden before any referenced formula is evaluated. Invalid formula records retain `_formulas` for explanation and an empty effective value, never an accepted stale cache. Parser `issues` must accompany any consumer operation; `refreshDerived` does not authorize invalid data.

Import worker keeps all UNKNOWN_FIELD errors even if `ignored` contains a field. Existing explicit UNKNOWN_SHEET ignore handling remains; no new field-ignore contract is introduced. Parsed errors + model errors remain blocking. Preview staging may write private source/snapshot files; committing an invalid preview must return 422 without adding a dataset/version or changing previous source/table/snapshot hashes. Saving a bad FK/cycle/interval/parameter must return 422 before any dataset/state persistence. Existing router obeyed these contracts in real HTTP checks; Test did not edit it. Dev must absorb the four product files and this qa source, then fix a main SHA and verify its own changed integration seams.

Run in an existing app container, using private /tmp fixture/state and serial Node heap64MiB:

```
python3 qa/input-data-upgrade-atomic-fixtures.py /tmp/input-atomic-r1/fixtures
ATOMIC_FIXTURES=/tmp/input-atomic-r1/fixtures ATOMIC_REPORT=/tmp/input-atomic-r1/model.json node --max-old-space-size=64 qa/input-data-upgrade-atomic-model.mjs
ATOMIC_FIXTURES=/tmp/input-atomic-r1/fixtures ATOMIC_PRIVATE_STATE=/tmp/input-atomic-r1/new-state ATOMIC_REPORT=/tmp/input-atomic-r1/http.json node --max-old-space-size=64 qa/input-data-upgrade-atomic-http.mjs
```

HTTP script instruments only the real fork's heap setting (existing router uses180; test sets64), uses real import Worker/Express/router/persistence and a temporary 127.0.0.1 ephemeral listener, and closes it on exit. Permission middleware accepts the explicitly isolated synthetic selftest actor; production authorization is outside this change. Do not target 18240/18251, reuse existing state paths, start a permanent server, install dependencies, run standard builds or load the full Excel under the current capacity restriction.

Fixtures use all29 approved sheet identities and307 field headers, sixteen input tables present, four related materials with three BOM edges and a supplier/parameter/conversion. Independent expected chain is FG001(4+1)+SF001(2+1)+SF002(1+1)+RM001(2+1)=13; old parameter3 gives12. This is explicitly synthetic, not a replacement for original full-Excel numeric expectations or QA UAT. The old oracle/fixtures remain read-only.
