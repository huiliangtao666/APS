# UAT06 independent AC06/15 task selftest

Dispatch `uat06:ac06-15-selftest:96a9dae:20261031:r1`; result `dlv_f6f53d02-ecf9-4e92-b993-f61f17c2809c:r1`.
Fixed product `96a9dae3ff13d3254c091567fa57cad5d8f37279`, parent `0c9a527fe84523665b26f3ea00aab2f90a0e875f`, source base `be88f073b4c2597abcd3e5533e92f7f94a89ad59`.
Only new qa/uat06-* files. No product/environment edits. No main merge/publish/QA UAT signoff.

Read current Issue3, Project2 original FR006/R2.2 card and v0.3 plus effective CR-DEC02-03. DEC04/05/06 is design/mock only. The original19 CSV bytes and controlled archive provenance are retained separately.

Source distinction: original05 G01 capacity2, original12 three FILL demands1; original05 T01 capacity3, original12 three MIX demands1. The baseline prose says three tasks need three sets with two available, while the illustrative trio is MIX. Report this ambiguity to PM/user; do not assume a corrected customer value or a required order. Core tests derive G01 FILL capacity from raw sources. The separate T01=2 case is explicit replaceable software configuration. Runtime tool applicability, parameter-source choice, whole-task occupation, unit and order repair values are supplemental simulation, not customer defaults. All literal early/late values are0; late10/single-set/calendar/stop/demand3 are explicitly labeled variants.

The actual browser previews raw19 without writing: HTTP200 is a preview response, valid=false and nine missing order fields; it is not successful raw import. It then imports separate normalized CSV simulation, using selected task-referenced G01/T01, machine/route/time/order/calendar values derived from raw. LABOR/MATERIAL/CAPACITY and other disabled rules remain disabled; no BOM/physical stock or real execution claim. G60 and unused machines remain in the unmodified external originals. No raw-source runtime mapping or customer account readiness is claimed.

The stdlib Python oracle imports no product code. It reconstructs duration, machine dependency, predecessor, calendar/downtime, acquisition/release, tool capacity and full six-task demand coverage. It checks the saved Worker ledger against those independently reconstructed intervals and colors G01 reservations onto two interchangeable oracle set labels (not customer asset IDs). Every permutation of a complete legal alternative is accepted. Negative simultaneous3/cap2, return59/60 and late69/70, missing task, wrong machine, wrong sequence and calendar mutations are explicit. Native CSV is parsed into tasks/reservations and rechecked by the same source oracle.

Actual API Worker cases cover core, T01=2, G01=1, late10, calendar100, machine-stop100, tool availability100, demand3/cap2 and MOLD off. Synthetic query403, stale409, negative capacity400, missing claims400, unsupported rule400 are zero-write. Deliberately illegal diagnostic plan copies independently test the product checker and are never scheduler outputs. Actual UI shortage links problem→A-FILL→frozen resourceClaims→same task; UI capacity2→1 changes new calculations; reload/process restart and original native export preserve history. No mock physical return event or across-plan stock deduction is claimed.

Replay in an isolated app container only, never VM host. Set B2_INPUTS to extracted inputs/raw, UAT06_OUT to a private evidence folder with source-manifest.json. Install lockfile dependencies, SDKs, Playwright1.56.1/Chromium and build there. Official app-exec standalone was used; no persistent preview endpoint remains.

```
B2_INPUTS="$B2_INPUTS" UAT06_OUT="$UAT06_OUT/api" node --experimental-strip-types qa/uat06-selftest.mjs
B2_INPUTS="$B2_INPUTS" UAT06_OUT="$UAT06_OUT/ui" bash qa/b234-browser-runtime.sh node --experimental-strip-types qa/uat06-browser.mjs
UAT06_OUT="$UAT06_OUT" node --experimental-strip-types qa/uat06-diagnostics.mjs
UAT06_OUT="$UAT06_OUT" node --experimental-strip-types qa/uat06-environment.mjs
python3 qa/uat06-oracle.py "$B2_INPUTS/UAT-06" "$UAT06_OUT"
```

UAT06_CASES resumes selected unexecuted API cases. An initial QA harness referenced a nonexistent plan.unplanned field after the Worker correctly returned5 tasks; the harness was corrected to inspect actual partial run/findings. Seven completed core cases were not rerun. All initial logs remain; product source never changed. The final oracle-only expansion rechecked saved originals/outputs without repeating product calculations.

Remaining gate: PM reviews originals/hashes/matrix, tells user the baseline/resource ambiguity and explicitly bounds the chosen scenario (G01-FILL source capacity2 versus separately configured T01-MIX2), verifies APS-Dev's independent persistent QA entry/roles/config at the same product SHA, then dispatches QA for its own UAT. Raw19 direct operation additionally needs explicit missing order fields and valid source/runtime mapping/contract configuration. Customer facts/defaults are unapproved. Whole FR006/Issue3/CR closure remains PM's determination across all applicable assertions.
