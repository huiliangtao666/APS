# R2.1 user decisions: isolated module delivery

Authority: Issue6, Project2 original R2.1 card, v0.3 FR008/013/016,
AC05/15/17 and UAT02, plus CR-R21-UAT02-20261031 D01/D02/Q01.
This branch starts directly at cd10560774817c67bc0d6f0f7f6c66279941f89c.
It does not merge APS-Dev's in-flight FR013/FR016 branch.

## Implemented modules

- `src/lib/r21-stage-config.mjs`: six independent typed enum values,
  per-value source kind/reference/version, exactly two initial simulation values
  and four nulls, complete-configuration guard, order overlay, device usage and
  narrow D01 policy classification. Neither original rows nor CSV bytes are changed.
- `server/r21-config.mjs`: revision-checked configuration, immutable before/after
  history, application ledger, source fingerprint and normal validated order-save
  callback. Missing/invalid values cannot be applied. The host must supply its
  authorization callback; production protection is not replaced.
- `src/R21ConfigurationPanel.tsx`: independent values and sources, visible simulation
  labels, save/reopen, explicit application to current input, device usage query.
- `qa/r21-uat-server.mjs`: opt-in, nonproduction-only isolated identity and separate
  marked data directory. No login, invitation, enrollment or member account setup.
  The production entry point and auth modules are unchanged. Initial isolated
  business input has the six values blank; no old full seed is silently adopted.

## Runnable isolated path

Run commands **inside an application container**, never install or start on the VM host.
From this repository with its npm dependencies installed:

```sh
NODE_ENV=development APS_R21_UAT_ISOLATED=1 PORT=4316 \
  R21_UAT_DATA_DIR=/tmp/aps-r21-uat-review \
  node --experimental-strip-types qa/r21-uat-server.mjs
```

Open the printed loopback URL from the same isolated runtime. UI build is included
in this command. Data survives process restart if the same marked directory is
supplied. To reset, choose a new empty directory. This is a runnable local QA path,
not a published Portal binding or proof of a cross-workspace browser endpoint.
For task verification:

```sh
ISSUE6_INPUT_DIR=/path/to/controlled/UAT-02 \
  R21_EVIDENCE_DIR=/path/to/evidence \
  node --experimental-strip-types --test qa/r21-decisions.test.mjs \
    qa/issue6-calendar.test.mjs qa/issue6-integrated.test.mjs \
    qa/uat-r21-integration.test.mjs
```

The browser replay additionally needs Playwright 1.56.1/Chromium 141 and its Linux
shared libraries. Run `qa/r21-decisions-browser.mjs` with the same input/evidence
environment. Original input files remain in the controlled evidence package,
not in this public source branch.

## Exact integration seams awaiting the shared-file owner

Do not mark these as PASS because the modules compile or their unit tests pass.

1. **D01 full original03 import: BLOCKED pending shared validator wiring.**
   `server/input-validation.mjs` collects `validateProcessConfig` findings.
   After ordinary complete-state validation, apply
   `r21DevicePolicy(findings, proposedData).blocking` for the R2.1 scope and retain
   `.permitted` as visible informational records. The only admitted finding is
   `INPUT / MACHINE_OPERATION_REFERENCE` for a source-bound, unused machine whose
   operation is absent from this stage route. Keep every duplicate, required,
   capacity, calendar and dependency check. Do not delete machines to make validation
   pass. Carry `r21DeviceUsage(proposedData, csvSources.machines)` to query/view output.
   Both preview and commit must use the same policy. Current unchanged shared
   business router demonstrably still rejects four original03 records.
2. **D02 production App/API attachment: PARTIAL.**
   Mount `createR21ConfigRouter` from `server/index.mjs` under `/api/r21` with
   production authorization. Render `R21ConfigurationPanel` from the intended
   App data/configuration view. `saveOrders` must use existing business validation
   and return the persisted input revision/hash. The isolated QA host already does
   this through `/api/inputs`; it never writes business order changes directly.
3. **D02 original17 batch repairs and frozen source: PARTIAL.**
   `server/csv-batch.mjs` / `src/CsvBatchPanel.tsx` still use their existing explicit
   six-row repair UI. Wire a config snapshot to the physical original17 rows using
   order IDs; reject missing/duplicate/unknown identities and missing config.
   Preserve each source/ref/version and config fingerprint in the import evidence.
   The new application ledger preserves the exact config and resulting input hash,
   but `server/run-input.mjs`, `server/business.mjs`, export and existing plan input
   APIs do not yet embed it. Do not claim the normal frozen plan/export itself
   contains six-field provenance. Separate config/business files also do not provide
   an atomic cross-file transaction if the process crashes between input save and
   application-ledger write; final production integration must join that transaction.
4. **Q01 endpoint handoff: local runtime PASS; external QA endpoint not established.**
   PM can arrange the isolated runtime/preview from this branch without formal
   account requirements. No Portal publication is authorized by this work. The
   QA host supplies a visibly synthetic operator, not a customer or verified user.

APS-Dev owns the above shared integration. This delivery owns only the new R2.1
module/configuration/QA files. PM must coordinate a new integrated fixed SHA and
the remaining full original03, original17 provenance, UI/API/Worker/AC17 checks.
Historical PASS stays on its original SHA. This delivery is task self-test evidence,
not independent QA UAT, whole Issue6 acceptance, a main merge or publication.
