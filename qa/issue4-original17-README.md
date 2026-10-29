# Issue4 original17 explicit-entry compatibility

Authority: APS-BL-001 v0.3 FR013 AC02/03/26 + CR-FR013-VALIDATION-20261029.
Start: fc273441ca93dcc47996bf5a6f7031e73be7f226.

`node --experimental-strip-types --test qa/issue4-original17.test.mjs` runs synthetic, isolated service checks.
`node --experimental-strip-types qa/issue4-original17-browser.mjs` builds and exercises the real React app through Express using the existing QA runtime alias and synthetic membership fixture. Requires Playwright/Chromium, writable `/evidence`, and the controlled original CSV files under `/original/stage` and `/original/complete`. Never run against a real business store. Run all application commands inside an isolated application container.

Browser inputs: original UAT-01 stage 01/03/07/10/11/12/16/17 plus same-scene complete 02/08. Initial business tables are empty except existing runtime seed rules, explicitly retained as synthetic prerequisite configuration. Original import still replaces rules with original16 during full-batch inspection. User entry is simulated by six actual select operations: A and B each choose 否 / 正式订单 / 有效. These are test-operator choices, not source facts or approved customer defaults.

The full original batch remains BLOCKED after original17 repair: original03 includes HEAT/COOL/PACK absent from original10, and original16 disables required CALENDAR. Those are separate prerequisite/meaning questions outside this delivery; do not weaken validators or silently rewrite them.

For the scoped positive demonstration, original16 is omitted so the pre-existing runtime rules remain. Original03 is explicitly reduced to its six MIX/FILL records whose operations occur in the same-scene original10. All source values in those records are unchanged; the full original03 and subset physical-line mapping are retained in the evidence. Original12 four device rows and original10/17 remain intact. The report must distinguish this selected-input success from full-original acceptance.

The success chain is React upload → missing per-row diagnostics → six explicit selections → repreview → atomic save → reload → filtered order/dependency query → actual CSV download. The script also verifies identical repaired reimport creates no duplicates or store writes. API tests cover invalid enums/quantity, stale/foreign/revoked previews, forged commit inputs, real confirmed history, BOM and physical-row provenance.

Use the evidence manifest to obtain the controlled originals from APS-Dev; raw source documents are deliberately excluded from GitHub. This is task-level Dev evidence, not independent Test, Portal SSO verification, UAT confirmation, merge or release.
