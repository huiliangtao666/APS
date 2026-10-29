# Issue4 / FR016 U2 cross-record provenance

Authorization: delivery dlv_e237f736-d935-41d0-9cda-aef6fc52147a,
APS-BL-001 v0.3 FR016 / AC02,03,15,17 and existing G01 behavior.
Exact parent: c30276b626927fcc49bee6248946ff0819a5ee1e (U1 independent PASS
remains attached to that version). This unit is an implementation/evidence gap,
not a confirmed product failure or a new repair round.

BOM version/date conflicts retain the complete same-product/version group with
nonempty dates. Duplicate groups retain every original occurrence. BOM unit
mismatch retains the BOM row and the material row actually read by the existing
last-map comparison. Supply over-allocation retains the actual byId baseline
and all summed uses, excluding unrelated supplies and references. Delay errors
retain the current delay and the previous event/original supply actually used
by the existing calculation, with original input positions despite sorting.
The original calculation advances its baseline after every event; provenance
does not change that behavior or silently substitute a different valid event.

Enabled-rule missing data retains existing rules and coverage triggers. Truly
absent mandatory rules have zero records and explicit missing-target metadata.
The existing early invalid_rule_selection remains HTTP400; its diagnostic now
includes the already applicable absent-rule findings and the checked input.
No missing target is fabricated as a record. No code/message/taskId inference,
automatic repair, lifecycle inheritance or history backfill was added.

Source/version/current identity, original queries and audited current edit
mapping reuse U1. The shared sourceRefs helper additionally retains distinct
positions when an in-memory group contains the exact same object twice.
Production persisted JSON normally yields distinct objects; neither case may
collapse original occurrences. Uniqueness and audited lifecycle remain required
for editing; deletion/renumbering/duplication/reuse cannot authorize a wrong edit.

Run only in an isolated application container with the existing QA runtime;
copy the checkout inside it and use isolated temporary business storage:

    npm run build
    npm test
    G01_EVIDENCE=/evidence node --experimental-strip-types --test qa/fr014015.test.mjs qa/confirmation.test.mjs qa/execution-facts.test.mjs qa/issue9.test.mjs qa/issue4-g01.test.mjs qa/issue4-u1.test.mjs qa/issue4-u2.test.mjs
    G01_EVIDENCE=/evidence node --experimental-strip-types qa/issue4-u2-browser.mjs
    G01_EVIDENCE=/evidence U2_PARENT_ROOT=/parent node --experimental-strip-types qa/issue4-u2-parity.mjs

For parity mount a clean checkout of the exact U1 parent read-only at /parent.
The 300 diagnostic/3 valid-plan comparisons are a predicate/result regression
guard. Expected membership comes separately from Design's original mock-cases
(verbatim issue4-u2-design-input.json) and explicit independent member assertions,
not the output of the algorithm under test.

Browser checks use real React/Express/Chromium and synthetic members/runtime
alias, not real platform SSO or QA UAT. Invalid-input Worker checks directly
exercise the production bundled Worker; they are not successful HTTP persistence
of an invalid plan. A separate valid HTTP Worker run verifies frozen history.

U2 producers and the early missing-rule HTTP/UI path are implemented. Old history
without sources remains unknown (F01); CSV physical rows, U3 resource/execution/
planner/reviewer source gaps, automatic old-history reconstruction and business
disposition remain outside this unit. Existing legacy plans are not rewritten.
No migration is needed; new finding metadata is additive. Rollback uses the U1
parent checkout/build while retaining business storage. This restores the
parent's recorded provenance gaps; it is not a claim that rollback is safer.
No main merge, publish, Project/Issue write or QA/UAT approval is authorized.
