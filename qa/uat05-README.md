# UAT05 independent material task selftest

Dispatch `uat05:ac08-10-11-17-selftest:96a9dae:20261031:r1`; result `dlv_365426df-7eb4-49ec-b317-1cd73785e813:r1`.
Product `96a9dae3ff13d3254c091567fa57cad5d8f37279`, direct parent `0c9a527fe84523665b26f3ea00aab2f90a0e875f`, source base `be88f073b4c2597abcd3e5533e92f7f94a89ad59`.
Only six new `qa/uat05-*` files; no product or environment file edits. Authority is v0.3 UAT05/AC08/10/11/17 and applicable effective CR. DEC04/05/06 remains design/mock.

This is independent task evidence, no QA signoff. No persistent endpoint is supplied; PM separately dispatched APS-Dev for it. Synthetic QA identities are not customer SSO. All supplemental choices are replaceable software simulation, never customer defaults.

The original UAT05 nineteen CSVs are retained byte for byte in INPUTS.zip. The literal240kg/yield0.96 and650/150/150/50 recipe yields162.5/37.5/37.5/12.5kg per order. Original13 has162.5kg lean; original14 adds162.5 at minute180. Original16 enables machine/precedence/calendar/tool/personnel/material. All are checked. A reference arrangement is not required.

The real raw19 batch with supplemental resource choices is rejected atomically: active MATERIAL cannot bind original12 `由BOM计算` without an approved runtime mapping. No successful raw19 calculation is claimed. The runnable simulation explicitly selects original05 G01/T01 and06 LP01, clears active source12/13/14 and supplies separately named runtime dependencies, BOM, inventory, expected supply and B's162.5kg supply reference. Literal quantities, skill/capacity and quality policy are source derived. Runtime BOM version/effective day/kg, location, epoch08:00 Shanghai, date-level expiry, order repair choices, resource shift/pool/full participation and contract adoption are explicit simulation selections. Raw material dependency numeric0 is only a validation placeholder; demand comes from BOM. No BAG recipe is invented.

The actual React/Express/Worker path imports that explicit replacement, calculates four legal tasks, saves/reloads/reopens and downloads native CSV, links an actual0.1kg shortage to B-MIX/frozen supply/return, edits availability180to240, and preserves old frozen inputs/native bytes. Nine isolated API/Worker cases include missing supply,0.1 gap, disallowed supply, pending stock, delay240, personnel/tool/calendar start200. Their allocations are projected plan usage; physical input inventory is unchanged. The independent stdlib Python oracle reads original CSVs, checks rational quantities, all six enabled rules, task coverage, ledger conservation, native export, another legal schedule and six mutations.

A deliberately illegal B179 saved copy is a diagnostic fixture, not a Worker outcome. The actual checker detects supply-not-ready but both generic findings have empty taskIds. This diagnostic linkage is PARTIAL; ordinary Worker-shortage linkage passes. Do not treat a diagnostic copy as product scheduler FAIL or increment repair rounds. Full customer mapping, real identity, full FR010/global physical inventory contract and QA business confirmation retain their original boundaries.

Replay only in a fresh isolated application container through official app-exec standalone. Install lockfile/platform SDKs, Playwright1.56.1 and Chromium there; never on the VM host. Set B2_INPUTS to extracted `inputs/raw` (contains UAT-05), UAT05_ROOT to an absolute private evidence folder containing source-manifest.json:

```
npm ci --no-audit --no-fund
npm install --no-save --package-lock=false playwright@1.56.1
npx playwright install chromium --only-shell
npm run build
B2_INPUTS="$B2_INPUTS" UAT05_OUT="$UAT05_ROOT/api" node --experimental-strip-types qa/uat05-selftest.mjs
B2_INPUTS="$B2_INPUTS" UAT05_OUT="$UAT05_ROOT/ui" bash qa/b234-browser-runtime.sh node --experimental-strip-types qa/uat05-browser.mjs
UAT05_OUT="$UAT05_ROOT" node --experimental-strip-types qa/uat05-environment.mjs
python3 qa/uat05-oracle.py "$B2_INPUTS/UAT-05" "$UAT05_ROOT"
```

Use UAT05_CASES as a comma-separated list to resume only unexecuted API cases; an explicitly empty value runs source-guard/rejections only. Do not repeat same-version completed assertions without a relevant change.

Execution attempts retained: initial QA input had nonnumeric source literal in a numeric runtime field, ISO milliseconds, and missing supply reference; rejected as designed. Subsequent QA setup wrongly assumed pending stock prevents B from using its explicit supply, then tried to import unmapped source12, and attempted mappings for unused resources without demands. Corrections affect only QA fixture/expectations. Final browser run completed with8 PASS/1 PARTIAL, no pageerrors. API10 PASS; oracle25 PASS. No product changes, new confirmed product FAIL or repair round.
