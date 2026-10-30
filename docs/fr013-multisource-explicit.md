# FR013 R-C01: multiple original rows, one explicit physical identity

Authority: APS-BL-001 v0.3 FR013, AC02/03/26, effective CR-FR013-VALIDATION-20261029 and PM delivery dlv_c76969f4-9d99-4082-91fa-4d3efeff98db. Base bd6f9fabe8354432e9c67b52219dc26989c2761d. This implements the missing R-C01 positive case; it does not close FR013. No defect repair round is incremented.

## Supported contract

Table 31 adds optional column 字段权威JSON. Original 19-column v1 CSV imports and frozen v1 runs retain their meaning. Multiple distinct source IDs can explicitly bind the same existing 工装编码 or 人员组编号. Every participating row must select FR013-resource-map-v2, EXPLICIT_SAME_ENTITY and READY, with a unique stable configuration ID and positive configuration version. The target record must already exist exactly once. Tools and personnel remain separate typed identities. Separate personnel groups sharing an existing physical pool keep their existing P10 contract.

For every source field except its identifying first column, 字段权威JSON selects exactly one configuration ID and its current version in this entity's group. All participating rows must specify the same choice for each field. Different fields may select different rows. There is no first-row default. Example entry:

```json
{"可用数量":{"配置编号":"CFG-original-A","配置版本":"2"}}
```

The full object must cover all six original05 non-ID fields or five original06 non-ID fields. In the UI, choose v2 and EXPLICIT_SAME_ENTITY per row, complete source/target snapshots and the common runtime identifier, increment changed configuration versions, then choose each field's authority in the entity fieldset. Partial authority choices remain a local draft until complete. Joint preview must succeed before the editor enables save. API and CSV save independently validate all conditions.

Source names may differ and remain aliases. Name authority identifies the selected source label; it does not silently rename the separately configured runtime entity. Source IDs remain provenance identifiers; stable runtime ID is explicitly supplied in each row. Runtime-only fields (tool demand, group name/shift/pool membership, claims and dependencies) remain explicitly configured in the target/table12/table23 snapshots, and are not inferred from CSV. This is equality binding, not a merge or conversion formula.

Original05 operational type, capacity, window and sharing scope must agree literally across all participating rows and meet existing source-to-runtime checks. Original06 skills, headcount, window and sharing scope must likewise agree. Group runtime snapshots, source type, line, scope, units and release policy must agree. Positive integer capacity, integer minutes 0–525600, global scope 全工厂/*, single explicitly selected line, tool 套 and personnel 人 retain the base contract. No capacity addition, multi-window union, skill intersection or guessed priority is supported. A chosen authority cannot override an operational conflict.

## Rejection and atomicity

Missing/extra authority fields, missing/duplicate/out-of-group authority identities, stale versions, differing authority choices, operational conflict, mixed direct/alias modes for one target, unknown units/modes, duplicate source IDs/mappings and duplicate runtime identities are rejected. Conflict preview reports NOT_READY_CONFIG with file/row/field/reason. Explicit same-entity mappings cannot be saved incomplete under NOT_READY_CONFIG status; API/CSV save and new run refuse before any business-store write. Existing source-only storage and unbound ordinary configuration drafts keep their previous contract, but do not enable runs.

Existing trusted role, operation reason, input revision, preview ownership/state hash, configuration transition/history version and protected-history guards remain active. Reintroducing a deleted configuration ID must exceed its historical highest version. Changing any existing mapping/authority/snapshot requires its configuration version to increase. Changes to a selected authority's version require every referencing row to update and increment, preventing stale authority use.

## Adoption, provenance and compatibility

New runs validate every source and mapping before starting a Worker. Their frozen input contains every source and mapping, and the originalResourceVersion hash covers the mapping and operational configuration. v2 conditions also contain originalResourceEntities: one entry per typed runtime ID, one target snapshot, all source IDs/configuration versions/record positions and each field's selected authority/version/literal value. The scheduler consumes the existing single target record; it does not iterate source aliases to create capacities, claims or reservations. The independent checker reconstructs group membership, field authorities and source/target equality without calling the mapper or scheduler, then the existing resource checker validates the reservation ledger.

Table31/source/runtime typed query links and current/historical exports retain all rows and the authority column. The frozen conditions expose selected authority values and source record positions. On changed original05/06/table31 CSV imports, the trusted audit records additionally preserve the original file text, SHA256, parser-derived physical starting line for each CSV record and input version/batch identity, in the same atomic store write. This supports quoted multiline fields; the UI's “原表记录行” is the logical record row and does not claim to be a physical CSV line. Subsequent editor changes preserve the historical import audit. Exact no-op reimports retain idempotence and do not manufacture a new origin. Old records without import evidence do not gain invented physical line numbers. GET operations is the read-only audit retrieval path.

No stored input or historical run is migrated in place. v1 conditions remain v1; new v2 conditions can include independent v1 direct rows. Rollback: continue using the prior branch/version for its v1 stores; v2 input/runs require this implementation and must not be downgraded to v1.

## Reproduction and impact

Use the official workspace app-exec runner in an application container. Tests use synthetic trusted actors, isolated temporary stores and real Workers; they do not claim production SSO or QA UAT. Dependencies can be installed with npm ci in that container, or use existing container-compatible dependencies. Run:

```sh
node --experimental-strip-types --test qa/fr013-config.test.mjs qa/fr013-multisource.test.mjs
npm test
npm run build
PLAYWRIGHT_MODULE=<absolute-path-to-playwright/index.mjs> EVIDENCE_DIR=<absolute-output-dir> node --experimental-strip-types qa/fr013-multisource-browser.mjs
```

Browser requires Chromium system libraries and fonts; use installed dependencies or the existing test-only library/font environment. No live preview/binding change is required: the harness builds the real React app with a QA-only managed-runtime adapter and serves it with the real Express router.

Impacted assertions: R-C01 multiple-source positive and conflict refusal; targeted R-C02 physical pool/qualification capacity, R-C04 units, R-C06 windows, R-C07 independent checker, R-C08 atomic CSV/API refusal, R-C09 permissions/version/stale/history and R-C10 query/export content. Old independent PASS remains at bd6. R-C03 cross-line positive, native filename R-C10 assigned to Test2, DEC04–06 implementation, production identity and full UAT are outside this delivery.
