# FR-013/016 isolated batch-import test slice

This branch preserves the isolated six-table R1 CSV preview, cross-table validation, atomic commit UI, and regression harness for APS-Test. It is not merged into the root R1/R2.1 application. Do not replace root `src/App.tsx` with this prototype: it predates FR-001/002/004/025 changes on `main`.

## Reproduce module regression cases

Use Node.js 22 or newer from this directory:

```sh
node --experimental-strip-types verify.mjs
```

The reported container build was run in the APS-Dev QA application container; see `FR-013-016-R1-CSV-validation-fix.md`. The package expects Praetor SDK tarballs at `../../.praetor/sdk`, so a plain clone is not a standalone `npm ci` environment. Run full UI/build checks in a workspace/container with those SDK files available.

## Scope and known limits

- Six R1 CSV files are previewed together; field, type/unit, key, reference and route-cycle errors block batch commit.
- Hand edits/add/delete stay on the prototype's existing immediate single-table path and are outside batch atomicity.
- Browser UI acceptance remains for APS-Test; automated regression/build does not establish product UAT.
- Merge only after review against latest `main`; this prototype does not include subsequent FR-002/004/025 integration.
