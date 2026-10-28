# APS development and test handoff status

This file separates source publication from product acceptance and Portal deployment. The GitHub `main` branch is a consolidated application snapshot, so its commit history does not map one-to-one to FR cards. Test-only branches below preserve isolated slices without merging them into the R1/R2.1 application.

| Item | Git status | Current evidence / boundary | Follow-up |
|---|---|---|---|
| R1 | Published on `main` | APS R1 source, CRUD baseline, schedule, tests and handoff are present. Product UAT is not recorded as complete. | APS-Test executes UAT-01 and records actual results. |
| R2.1 / FR-008 | Published on `main` | Calendar and downtime scheduling plus UAT-02 fixtures are present. Product UAT is not recorded as complete. | APS-Test executes UAT-02, including calendar inheritance, downtime edges and continuous-window cases. |
| FR-001 | Published on `main` | Single-line scope validator and automated cases are present. | Product UAT remains separate from automated tests. |
| FR-002 | Published on `main` | Product/material master validation and automated cases are present; no unit conversion or BOM calculation. | Product UAT remains separate from automated tests. |
| FR-004 | Published on `main` | Configurable route, fixed-time and resource-identifier validation is present; non-equipment resource semantics are not inferred. | APS-Test verifies UI behavior and records unresolved resource semantics. |
| FR-006 | Test branch `test/fr006-config-only` | Isolated tooling configuration CRUD prototype only. It does not calculate tooling occupancy or constrain schedules. DEC-02 remains open. | Test CRUD/CSV only. Merge-back and scheduling support wait for DEC-02. No product UAT or Portal publication. |
| FR-013 / FR-016 batch import slice | Test branch `test/fr013-batch-import` | Isolated six-table preview/validation/atomic import implementation and reproducible regression harness. Existing R1/R2.1 main app is not replaced by this branch. | UI import behavior and failure atomicity still need APS-Test UAT. Review the branch against latest main before any merge. |
| FR-015 | Partial baseline on `main` | The app supports direct row editing, add and delete. Full role-based access, copy, validation parity with import, confirmed-plan deletion protection and historical input retention are not implemented. | Keep open; implement and test the missing acceptance criteria before marking complete. |

## Known issues to track

1. **FR-006 / DEC-02:** clarify tooling occupancy boundaries, return delay, stable task reference, quantity scope and conflict semantics before scheduling integration. The isolated config branch must not be treated as schedule validation.
2. **FR-013/016:** run UI tests for valid batch replacement, bad batch rejection without partial writes, physical CSV row reporting and cross-table references. Keep this branch isolated until reviewed against current `main`.
3. **FR-015:** add role-aware editing, copy, equivalent checks on save, reference protection for confirmed plans and history/snapshot behavior.
4. **R1 / R2.1:** automated tests and builds do not establish product UAT. Record APS-Test results separately.
5. **Portal lifecycle:** `aps-r1` remains unpublished. GitHub branches are source handoffs only and do not publish the Portal app.

## Source of status

Status is based on the APS-Dev handoff files and files present in this repository. The available GitHub Project handoff record reported no visible cards, so this document does not claim to be a complete backlog export or to change any Project card state. APS-Design should reconcile these rows with the authoritative backlog when its cards are available.
