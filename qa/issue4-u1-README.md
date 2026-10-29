# Issue4 / FR016 G01 U1 developer verification

Authorized unit: APS-BL-001 v0.3 FR016, AC02/03/15/17; Issue4 user comment
6501024750 and Design source contract comment 6502033481. This is an existing
acceptance gap, not a new confirmed failure or another defect repair round.
Parent product: b5a9bcfeb155e5b494a6ebe64f95bf88593c4e51.

New master REQUIRED/VALUE findings retain the exact checked products/materials
row. DUPLICATE findings retain every occurrence in the group, including
byte-identical rows. Product/material references retain the actual order,
route or dependency referrer and describe an absent target separately.
Every orders check retains its actual participant(s). The prior predicates,
code/message, units, filtering and scheduling decisions are preserved.

The identity certificate is the input domain, SHA256 of exact saved input,
check time, revision, actual check scope, table, original logical occurrence,
original values and key multiplicity. CSV physical line numbers are not
invented. freezeRunInput keeps an explicit execution-to-original sourceMap
beside the existing frozen input and snapshot hash. Planner-side sorting
passes the original execution array to master/line-scope producers. Preflight
full-input validation and scoped execution validation resolve their sources
separately. New plan findings carry those explicit versions; task-linked
findings are retained unchanged.

Current lookup requires an originally unique complete existing recordKeys key,
a current unique key, the current-input domain and the existing audited input
transition chain. A deletion, rename, duplicate, known reuse or missing chain
rejects direct mapping. Original duplicates remain uneditable after deleting
one member. Trial diagnostics can be queried as original trial input but do
not authorize editing the main input, even if revisions or bytes match.
This adds no permanent business identity or automatic inheritance policy.
Supported writes continue through the existing server authorization, reason,
revision, history and execution-fact guards.

Preflight responses include a read-only checkedInput snapshot without a store
write. The UI retains that exact snapshot for original query, including
nonunique/empty keys and identical occurrences. Current query is a separate
action. Original values do not change when current input is corrected.
Original query never falls back to another plan/current row if its version
is unavailable. Frozen preflight queries do not offer a plan restore or export
under an unrelated plan's identity. Old history without provenance remains
unmodified; missing metadata does not grant edit rights.

Container checks (run only in an isolated application container):

    npm run build
    npm test
    node --experimental-strip-types --test qa/fr014015.test.mjs qa/confirmation.test.mjs qa/execution-facts.test.mjs qa/issue9.test.mjs qa/issue4-g01.test.mjs qa/issue4-u1.test.mjs
    G01_EVIDENCE=/evidence node --experimental-strip-types qa/issue4-u1-browser.mjs

Use the existing QA runtime image, copying this checkout into its internal
working tree; do not install or start the application on the VM host. The
browser fixture uses synthetic test members and a QA-only runtime alias. It
runs the real React/Express application and Chromium but does not prove real
platform SSO, independent Test or QA UAT. It uses isolated temporary business
storage. The direct bundled Worker invalid-input case is explicitly a Worker
fixture; the production HTTP API rejects those invalid inputs before plan
persistence. The separate valid HTTP Worker case proves original history
freezing after later saves.

No storage migration or history rewrite is needed. New run sourceMap, audit
revision metadata and finding provenance are additive. Retrying an old run
without a sourceMap does not reconstruct its original source positions.
Rollback is a normal checkout/build of the parent product; retain existing
business storage and evidence. The parent has its recorded provenance gaps
and weaker navigation identity behavior, so rollback is not a safety verdict.

Scope limits: U2/U3 aggregates and execution relations, automatic correction,
record creation, lifecycle inheritance, old-history reconstruction,
CR-DEC04/05/06 implementation, merge, deployment and UAT are not this unit.
Unrecorded out-of-band edits cannot establish an audited identity lifecycle.
