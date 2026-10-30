# Issue6 R2.1 S1–S3 integrated candidate

Authority: APS-BL-001 v0.3 FR001/008/013/016/025/034, BR05, AC05/15/17, UAT02; applicable existing CR-DEC02-03 behavior preserved. Original task dlv_bd29bbdd-32de-4fce-8fe1-8bcfdcaf7fc4, c1. No defect round added.

Run inside an isolated application container, with the controlled original UAT02 stage directory at `/inputs`:

```
node --experimental-strip-types --test qa/issue6-calendar.test.mjs qa/issue6-integrated.test.mjs qa/issue4-original17.test.mjs qa/fr013-validation.test.mjs
npm test
npm run build
node --experimental-strip-types qa/issue6-browser.mjs
```

The browser script additionally needs Playwright Chromium and writable `/evidence`. It builds the real frontend using the existing QA-only runtime alias and synthetic role fixture. This does not verify Portal SSO. Production identity is unchanged.

S1 preserves originals. Original17 kg maps literally to quantity and kg; six explicit software operator choices provide A/B split=否, demand=正式订单, status=有效. These are neither customer facts nor product defaults. The full original ten-table batch rejects four original03 records (HEAT01, COOL01, COOL02, PACK01) whose operations are absent from stage original10. The integrated validator also rejects original12 quantities, unsupported resource types and missing tool references. `stageInput({selectApplicableMachines:true,calendarOnlyDependencies:true})` explicitly derives a calendar test fixture with the six MIX/FILL device records and device-only dependencies. The unmodified files remain available as `originals`; the full original batch is separately asserted to fail. Original16 still enables CALENDAR. This fixture validates calendar behavior and does not establish acceptance of the omitted resource dependencies. Manifest-disabled tables remain untouched.

S2 `verify-calendar.mjs` independently evaluates fixed results using frozen rules, conditions, orders, devices, calendars, downtime and factory mapping. It does not import or call the planner. Half-open endpoints, single continuous work window, factory off and machine downtime, explicit/unique inheritance, missing references/time, rule configuration/adoption, minimal mode and absent historical snapshots have distinct outcomes. Protected execution facts are disclosed without moving their original times. Unknown enabled rules remain not_checked in per-rule coverage.

S3 binds producer-owned occurrences through the existing run source map into the frozen version's server-owned CSV provenance. Per-row file, physical row, field, occurrence and SHA256 are displayed. Table edits invalidate CSV provenance for that table. Missing physical source is associationGap; neither translated prose nor current same-position rows establish identity. CALENDAR findings link to the same task from result, timeline and problem panels; original source queries have a return-to-task button. Only saved tasks get geometry. Saved fixed invalid14 output is injected in the test-only store to prove detection; production has no arbitrary plan injection route.

Migration: additive CSV metadata on new input versions only; old snapshots remain untouched and show unknown physical source. Verification is an explicit operation. Existing stale/immutable/confirmation guards remain; supported confirmation now also requires completed calendar checking. Rollback: use the previous product revision in an isolated environment; preserve new stores before rollback. No deployment/main merge is part of this task.

Original source CSVs are supplied in the private evidence package, never committed to GitHub. PM must resolve the full-original03/stage10 policy question, coordinate real identity prerequisites and assign independent Test against the pushed full SHA, then QA when dependencies are ready.
