# Issue4 FR013-NONDEVICE-REF-01 repair round 1

Scope: v0.3 FR013 / AC02 reference validation, plus regression protection of AC03 frozen history and existing query/save paths. Parent: bd58868fc210867b6f56c8262e3c35c8d5496831. Original delivery: dlv_38a76f28-3f1a-4414-a534-74f6421644a3:c1.

`validateProcessConfig` checks 工具 / 模具 dependency identities against the existing `tools[].工装编码` master. This is reference integrity, not original05 schema mapping or automatic scheduling resource claims. Existing approved table18/table23 rules still define scheduling usage. Preview, forced/direct writes, master deletion and calculation admission share validation. Planner diagnostics and React diagnostics must supply the same tools master; the rules input fingerprint includes it. Original file/physical row/field mapping is unchanged.

Tests run in an isolated Docker container with the actual Express router and built React, using the existing synthetic QA membership seam. Never install or run this app on the VM host.

Prepare `/evidence/selected.json`, `base-prerequisite.json`, `base-store.json` from the APS-Test original SOURCE-PROBE c1 evidence ZIP (hash index delivered separately). `source-expected.json` must fingerprint the checked out src/server files. Runtime working directory is repository root; `/evidence` is a writable scratch output mount.

- `node --experimental-strip-types qa/nondevice-original-probe.mjs`: unchanged original Test probe, 22 checks. Its compatibility observations remain observations; its exit code alone does not imply all checks passed. Inspect assertions.json.
- `node --experimental-strip-types qa/nondevice-ref-r1.mjs`: repair-specific checks; nonzero exit on any failure. Explicit synthetic current-table tooling masters are engineering fixtures, not original05/customer facts.
- `npm run build`, `npm test`.
- `node --experimental-strip-types --test qa/fr013-main.test.mjs qa/fr013-validation.test.mjs qa/issue4-original17.test.mjs`.

Original05/06/09 mappings, original12 personnel/BOM positive acceptance and complete original category resource semantics remain BLOCKED. Do not interpret these tests as full FR013 acceptance, independent Test verdict, QA UAT or release approval. Old test evidence retains its old SHA. No data migration: legacy invalid live references are diagnosed and block writes/calculation until explicitly corrected; immutable prior history is not rewritten. Reverting the repair restores the unsafe reference acceptance and is not a data repair.
