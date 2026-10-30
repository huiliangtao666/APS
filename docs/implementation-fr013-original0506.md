# Issue4 / FR013 original 05/06 field slice

Authority: APS-BL-001 v0.3 FR013, chapter 9 and AC02/03/26; effective CR-FR013-VALIDATION-20261029. Dispatch dlv_912d600b-c523-445c-a2cb-b4cee2ea0354 (issue4:fr013:0506:field-reference-slice:r1). Parent product 8422dcdf9f5d3a82407972573d5c1274b2c097c0.

The original seven-column 05 and six-column 06 files now have explicit input tables originalTools and originalPersonnel. They preserve every source field without inventing task occupancy, group names, shifts, release policies or shared pool identities. The existing tools/personnelGroups tables and resourceClaims retain their contracts. This is PARTIAL FR013, not complete original 05/06 operational acceptance.

Both original files use existing authenticated preview/commit, revision/owner/state-hash guards, atomic persistence, immutable inputs, query/filter/detail and export. All source fields are required. Counts are nonnegative safe integer literals, and minute offsets are finite nonnegative decimal values with end greater than start. These are structural checks: zero counts, custom type/scope strings and skill strings are retained without asserting their runtime semantics. Dates and unit-suffixed values cannot enter minute fields. Source IDs are unique per file; multiple rows for one group need an approved identity contract before support. No data migration or historical snapshot mutation is performed. An old persisted store may omit both tables.

Reference query links use explicit IDs and source resource type; they never join names. A link to an existing runtime record with the same identifier is a comparison aid only, not an approved mapping or proof of operational adoption. Imported source records do not satisfy runtime dependency reference checks. New runs retain the records in their frozen input and explicitly list their unimplemented mapping in unchecked scope. Existing runtime behavior is otherwise unchanged.

## Business decisions required via PM/user

- 05: map source 模具/工具 plus 共享范围 to current 工装 resource/pool identity; define which explicit task/claim provides per-task quantity and acquire/return timing. Source data contains none of these policy choices. Shared full-factory capacity cannot be inferred from a single-line scheduling result.
- 06: supply group name and shift or approve a precise explicit mapping; define whether multiple windows/skills share one group capacity and how source sharing scope maps to physical pools. Never use the skill as the group name or invent a shift.
- Confirm operational treatment of zero availability, custom type/scope strings and repeated group windows before adopting them. Source preservation does not approve any of these operational choices.

Until those decisions are supplied, the source fields may be maintained and inspected, but full 05/06 business import, runtime resource adoption, original 12 personnel mapping and full UAT remain unaccepted. Existing original01/03,02/04,07/08 independent PASS evidence stays at its original SHA. No defect repair round is incremented by this implementation gap slice.

Verification: qa/issue4-0506.test.mjs and qa/issue4-0506-browser.mjs. Use the workspace app-exec.sh --validate runner in an application container; browser suite additionally requires Playwright/Chromium. EVIDENCE_DIR defaults to /workspace/temp/issue4-0506/evidence. No main merge or publish.
