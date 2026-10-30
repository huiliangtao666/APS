# Issue3 / FR006 tool row locator repair 2/2

Base: fe7098a08d24f58e42f6298fcd03e65cc7950ce8. Requirements: APS-BL-001 v0.3 FR006/BR06, applicable AC06/15 + effective CR-DEC02-03-20261029.

`validateJointResources` keeps safe positive integer and decimal syntax rejection. Errors already reported by `validateToolRows` for the same tool row/field are not repeated. Additional stricter failures carry table/file/row/field, enabling existing UI and CSV physical-line mapping. The business-rules boundary also supplies the tool CSV filename for existing resource-policy field findings; validation predicates stay unchanged. No scheduling, data migration, defaults, permissions or storage changes.

Run in a disposable container with dependencies and Chromium, not in a live app directory:

```sh
npm run build
node --experimental-strip-types --test qa/dec0203.test.mjs qa/dec0203-repair-r1.test.mjs
node --experimental-strip-types qa/fr006-row-locator-r2.mjs
```

The browser runner writes evidence under `/evidence`, creates its own temporary business storage, and uses synthetic planner membership with real root React/Express. It exercises second-row zero, four quantity errors on two rows, scientific notation and unsafe integers, unrelated field errors, every returned UI/CSV locator, multiline physical CSV mapping, complete storage byte equality, invalid preview no commit, and valid two-row confirm/reopen revision 1 to 2. `BASELINE=1` collects the original defect before the fix without expecting corrected metadata. Existing independent PASS remains attributed to fe7098a; this targeted Dev regression is not independent acceptance or QA UAT.
