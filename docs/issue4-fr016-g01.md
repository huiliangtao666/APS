# FR016 G01 global/cross-record navigation

Authorized by PM delivery dlv_fa9e4ed7-5e27-4d72-b666-3e4b81006e28,
Issue4 comment 6501024750 and Issue13 comment 6501025865, APS-BL-001 v0.3
FR016 / AC02/03/15/17. No product-defect repair round is assigned.

A no-task finding opens ProblemRecords. It lists only producer-supplied
`relatedRecords: [{table, row}]`, copying exact check-input row values. Its first
visible row is selected on every opening; selection, query and current-record
editing are separate user actions. Missing values display 待补充.

Single-line scope checks supply explicit participant orders/machines; other
structured checks can supply table and CSV-style data row (2-based including
header). `attachProblemRecords` copies only that precise source row. No message
parsing, code-prefix-to-table fallback, task synthesis, or whole-table substitute
is used. Record identities use the existing recordKeys contract and require a
unique current match. Optional personnel key components may remain blank; core
identity fields must exist. Missing, duplicate, removed or changed IDs block
direct editing. Existing save/revision/reason/role/history/fact guards still run.

The current Express preflight rejects invalid line scope before any plan is
created. It keeps the 400 response and adds exact diagnostic findings with
sourceRevision; 422 input/rule errors retain their original issues and add
source-row findings. Legacy display locations inferred from message text are
explicitly excluded from authoritative associations. This path writes nothing. Current diagnostic queries use
current data; persisted diagnostic queries use the selected plan's frozen input.
The list retains original check values and warns when current values differ.

Legacy findings containing only code/message/taskIds cannot establish an exact
record relationship. They open an explicit empty list/source-gap explanation;
they are not migrated or matched by prose. Rule-level issues with row0 (for
example an absent mandatory rule) have no source row to invent. Producers that
lack table + source-row metadata or explicit relatedRecords remain a documented
data contract gap. Complete global/cross-record coverage is not claimed.

Reproduce from this branch with the ordinary build/npm tests plus:

    node --experimental-strip-types --test qa/issue4-g01.test.mjs
    G01_EVIDENCE=<output> node --experimental-strip-types qa/issue4-g01-browser.mjs

Run in the application container with existing dependencies and Playwright
Chromium. QA uses isolated temporary business stores, synthetic membership and
the existing QA runtime alias. The browser test explicitly loads a historical
core diagnostic and its exact frozen input, since current preflight refuses to
create such a plan; this is fixture data, not evidence of an accepted API run.
It separately proves actual 400 preflight -> click -> list -> selection -> query
-> edit -> save -> reload -> recheck, query-role 403, zero associations and the
existing task-linked material finding. No platform SSO/UAT/publication claim.
