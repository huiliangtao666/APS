# B09 material domain delivery

Event: `b09:joint-development:12d453d:20261031:r1:APS-Test`.
Base: `12d453d7cb03829dc609115e48c5e4c19af4a6ec`.
APS-Test owns only the four changed domain modules and `qa/b09-test-*`.

Existing public signatures and declaration files are unchanged. Quantities and
shortages retain exact numerator/denominator fields. The allocator ledger is
private to one candidate plan; it does not introduce global reservations.
`materialPolicy` returns null for disabled MATERIAL: callers must retain
“material not checked”. Expected supplies remain conditional simulations.

Changes align quantity validation with the existing decimal calculator, compare
inventory occupation and expected-use totals exactly, and reject invalid supply
expiry/readiness/arrival combinations before allocation. Inventory readiness now
uses the existing timezone-explicit supply time contract. No formula/default is
added, and original09 six-column BOM remains literal and unmapped.

Run Node tests inside the application container:

```sh
node --test qa/b09-test-*.test.mjs src/lib/inventory.test.mjs src/lib/material-allocation.test.mjs src/lib/expected-supply.test.mjs src/lib/bom-config.test.mjs src/lib/independent-verification.test.mjs
B09_OUTPUT=/path/to/scratch node qa/b09-test-evidence.mjs
```

The independent oracle reads the exported files and imports no product code:

```sh
python3 qa/b09-test-oracle.py /path/to/scratch
```

If Python is absent in the container, run that file-only oracle on the host.
Dependency installation and builds must use an isolated application-container
copy. Root local SDK tarball references need resolving in that disposable copy;
never install dependencies on the VM host or modify an existing QA environment.

Material impact integration reuses existing B301/B302/B303/B307 tests only. This
does not repeat the complete UAT05/07/08 UI/API/Worker suites. Dev owns final
integration, full enabled constraints, UAT11 four-error atomic rejection, actual
API/Worker/store reopening/export and the runnable QA environment. JSON and CSV
tests here exercise domain serialization only, not application persistence.

WAIT_APPROVAL: original09-to-normalized version/unit/basis/yield/loss mapping,
unknown unit conversions, added-material or combined-yield formula semantics.
Known normalized scenarios remain executable. No DEC04/05/06 implementation,
global reservation ledger, main merge, publication or QA sign-off is included.
