FR016 G01 U3 — source contract section 9; exact U2 base 08954ccb330147159ae3b1779a7f59ce67a51659.
Scope: provenance only. No threshold, enablement, disposition, identity inheritance, history migration, release or confirmation changes.

Independent validation (inside an application container, never npm on VM host):
npm run build
npm test
G01_EVIDENCE=<existing evidence directory> node --experimental-strip-types --test qa/fr014015.test.mjs qa/confirmation.test.mjs qa/execution-facts.test.mjs qa/issue9.test.mjs qa/issue4-g01.test.mjs qa/issue4-u1.test.mjs qa/issue4-u2.test.mjs qa/issue4-u3.test.mjs
G01_EVIDENCE=<directory> U2_PARENT_ROOT=<exact U2 checkout> node --experimental-strip-types qa/issue4-u3-parity.mjs
G01_EVIDENCE=<directory> node --experimental-strip-types qa/issue4-u3-browser.mjs
G01_EVIDENCE=<directory> node --experimental-strip-types qa/issue4-u2-browser.mjs
Browser requires Playwright/Chromium in the QA container; synthetic member seam only, not real platform SSO or QA/UAT.
Dev used aps-fr038-qa-runtime:latest, image sha256:0d45a31aa25c4cca1eaacbfd1ba4ee6d5028d899b329e49a6036a66fd0c35da8, disposable container/source copy and private business.json. No published binding changed.

Authoritative expectations: SOURCE r1 P21-P30 and section 9 U3; resource baseline is first actual machine find, consumption 60+60=120 vs120-10=110. Unrelated consumption excluded. Tests assert native tables, original occurrence, raw values and full matching group independently of algorithm messages.

Endpoint distinctions:
1. /calculate or /runs preflight HTTP422: current invalid resource/execution input. No invalid plan is persisted. /inputs legal resource correction then reload/recheck201 is a real API chain.
2. Direct production bundled Worker invalid resource fixture only proves metadata transport, not successful API generation.
3. Direct fixed-output checker fixture and API /plans/:id/verify after explicitly restoring a corrupted result prove checker-source production/transport; normal scheduler API does not emit those deliberately corrupt ledgers. Reproduction needs original frozen input plus the exact result ledger; do not retrofit historical provenance.
4. /inputs rejected transition409 supplies before/current and after/candidate snapshots, raw source rows, hash/position and taskIds[]. Candidate references cannot directly edit current input. React query caches both by exact hash. State/history are byte-unchanged.
5. Old no-reference fixture remains unknown and zero rows. Truly absent mandatory rule uses existing U2 known-absent path. No source inference from messages, codes, opaque task IDs or current row position.

Remaining source coverage is PARTIAL, not a confirmed new product FAIL or repair round. Current BATCH_CONFIG/BATCH_MATERIAL helper exceptions, route CONFIG/CYCLE, some execution BOM/consumption/admission/event and policy baseline paths still need per-producer trace coverage. The root per-assertion matrix identifies those groups and recovery owners; do not infer all P21-P30 complete from passing tests. Historical missing-source F01, CSV physical mapping F03, real identity integration, independent Test and QA UAT remain separate.
