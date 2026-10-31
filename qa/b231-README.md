# B231 original12 intake continuation

Parent: `7baefa4b86b81dc26975ab79a91c4914524a043c`. The initial normalized B2 evidence remains attached to that SHA. This continuation changes source intake, validation, freeze/checker and source presentation/export; it does not add a scheduling formula.

The original eight-column `12_工序资源与物料依赖.csv` is recognized by its exact header set and stored as `originalDependencies`. Its bytes, cell values, BOM, physical record positions and hash stay in `csvSources`. The editor's dedicated source template is `12_原始工序资源与物料依赖.csv`. Existing fifteen-column runtime imports retain their contract; `32_运行工序资源依赖.csv` is an explicit alias for a supplemental runtime table in the same batch.

Equipment projects from the original identity/count/window fields. For referenced tooling, the existing READY original05 mapping and table23 declaration must agree with original12 quantity and offsets. For enabled personnel, the existing READY original06 mapping and an explicit runtime personnel-skill demand must provide the group, skill, count, shift, phase, offsets and release choice. The adapter creates no pool, shift or business defaults. Conflicting canonical equipment conditions are rejected instead of being silently dropped.

Disabled or future categories are frozen as DEFERRED; unselected orders are NOT_SELECTED. Unsupported material computation is rejected per source row if MATERIAL is adopted. `由BOM计算` remains a literal and is never parsed as zero. Nonzero original personnel early/late offsets remain blocked by H-P04.

Original16 MOLD `{}` is not an implicit resource parameter configuration. A batch may explicitly request `resourceRuleBinding: {contract: 'CR-DEC02-03-v1', reference: 'nonempty authority reference'}`. Only that approved fixed contract is supported, and only for one MOLD row with exactly `{}`. The original16 text and original cell remain in source metadata; the selected mapping is separately recorded. Preview and commit use the same server-owned choice. The UI checkbox is initially off. No quantity, capacity, time or customer fact is supplied by this adapter.

New runs freeze each original12 occurrence, BOUND/DEFERRED/NOT_SELECTED status, selected runtime records and mapping versions. A separate fixed-output checker reconstructs adoption from literals and saved configuration without calling the adapter or scheduler. The resource workbench links tasks to original physical rows; native resource CSV export includes original12 adoption/deferment, original values and source hash.

`b231-fixture.mjs` supplies explicitly labeled engineering simulation supplements to exercise these contracts. All nineteen original files remain byte-for-byte intact. These supplements are not customer facts or approval of missing business choices. In particular named personnel shifts, physical pool policies and participation windows are additional explicit simulated values. Unconfigured literal batches must remain blocked with exact rows; their safe refusal is not a claim that the business import succeeded.

Run `qa/b231-replay.sh` from a VM with the previously verified image and absolute B231_REPO, B231_INPUTS, B231_B1_INPUTS and B231_OUT. Node/build/Express/Worker/Chromium run inside an isolated container with no network. This is task-level self-test, not QA UAT, a main merge or a publication.
