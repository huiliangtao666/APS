Issue4 / FR016 G01 remaining U3 producer provenance

Requirement: APS-BL-001 v0.3 AC02/03/15/17, G01 SOURCE r1, PM delivery
dlv_0ce12bdc-f6d7-46e1-85e4-571c28c29e9a. Exact direct parent:
17b70e14082e91be44e56bbc3f59eca02db018c0. Independent Test of that parent
remains a separate verdict. No business calculation, threshold, status rule,
identity lifecycle, historical backfill, or DEC04–06 implementation is added.

Run in an isolated application container with repository dependencies:

    npm run build
    npm test
    G01_EVIDENCE=/evidence node --experimental-strip-types --test qa/issue4-u3-remaining.test.mjs qa/issue4-u3.test.mjs qa/issue4-u2.test.mjs qa/issue4-u1.test.mjs qa/production-batches.test.mjs qa/dec0203.test.mjs
    G01_EVIDENCE=/evidence node --experimental-strip-types qa/issue4-u3-remaining-browser.mjs
    G01_EVIDENCE=/evidence U2_PARENT_ROOT=/parent node --experimental-strip-types qa/issue4-u3-remaining-parity.mjs

Create /evidence writable. /parent must contain the exact direct-parent source.
Browser QA needs Playwright Chromium and builds React with a synthetic actor
runtime. It uses isolated temporary Express/business storage; it is not SSO,
independent Test, or UAT. Existing U2/U3 browser scripts remain applicable.

Native optional demand-reader trace records original order/product, eligible
BOM version candidates and material dependencies before a helper can throw.
Scrap's expanded order is a calculation value, never an original input row.
Failed demand comparisons retain the actually summed material records. Batch
preparation records each native read up to the exception; explicit clone→source
object maps keep later route diagnostics from navigating synthetic batch orders.

Current API evidence: skill preflight and correction, over-quota consumption,
full execution-context mapping outside selected scope, event policy admission,
and an actual queued Worker BATCH_CONFIG result. Browser evidence: skill
finding→baseline selection→query→edit→save→reload→recheck. Existing U3 checker,
Worker, permission/version/invalid/zero-write and old-history regression apply.

Limits: the planner's late ROUTE_CONFIG/CYCLE branch is preempted by native
process validation on tested invalid routes. Its source retention is compiled
but runtime NOT_EXECUTED. Its code can equal the earlier native check code;
the producer message and context distinguish them. BATCH_MATERIAL's late helper
exception has no demonstrated current API input: preparation already validates
that helper/quantity at the same time. No guard is bypassed to fabricate it.
Authenticated historical frozen input/result/producer trace is required before
claiming historical replay. Missing old snapshots remain unknown/BLOCKED.

An additional joint-resources regression has an existing message expectation
/未支持/ versus production /不支持/. Run that suite on parent and candidate and
retain both logs. Do not change business messages or count it as a new product
repair round merely to make an old test expectation pass.

Root report/matrix/evidence ZIP/SHA/HANDOFF give the final fixed commit and
per-assertion scope. No full-card completion, main merge, publish, or UAT signoff.
