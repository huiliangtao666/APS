# B1 UAT01/02 integrated candidate

Authority: original Issues 4/6, Project2 FR013/FR016/R2.1/UAT02, APS-BL-001 v0.3,
CR-FR013-VALIDATION-20261029 and CR-R21-UAT02-20261031.

Source: isolated branch from 0dfcfe7c8e32436937c1e91fd6b12bfe1522f671;
cherry-pick -x d6fd0034a4a50441d3e6384959f998873fcb955c (all nine files),
then shared integration. No merge conflicts; main and publication untouched.
Historical Test PARTIAL at d6fd003 remains historical.

Production App mounts R21ConfigurationPanel in Data/CSV. Production business
router mounts /api/r21 under its ordinary actor/member/permission/CSRF checks.
Configuration, per-field history, applied orders, preserved input and application
ledger use ONE business.json atomic rename. No separate config file is used by
this path. Old standalone module callbacks are retained for compatibility only.
Two tagged simulation seed values and four nulls are explicit; six fields have
independent enums, source kind/reference/version. Null config can be saved but
cannot be applied. Config save does not silently change orders or old plans.

Original17 can explicitly adopt a saved config revision in batch preview. Server
validates unique A/B identities and re-parses its owned raw CSV at commit; manual
repairs cannot be mixed with this option. The raw text/physical rows remain exact.
Config, application ID/fingerprint and source are frozen in the new input/Worker
conditions and plan/run CSV. Later manual edits of the six values invalidate the
previous configuration attribution. Existing inputs/plans are not backfilled.

D01 permits unused device operations outside the current route, preserving all
original03 rows and query source/unused metadata. Required/duplicate/invalid
capacity/calendar/dependency checks remain active, including referenced devices.

Batch input stage is explicit: supported (R2.1) or minimal-r1 (UAT01). Only an
explicitly imported minimal-r1 input may keep the original CALENDAR=否 and run
with minimal-r1 scope; supported calculation still rejects that disabled rule.
The original UAT01 stage files are not rewritten to enable extra constraints.
Minimal-mode history explicitly records calendar as unchecked.

Run INSIDE an isolated application container, never on the VM host:

```
APS_R21_UAT_ISOLATED=1 B1_UAT_HOST=0.0.0.0 PORT=4316 \
R21_UAT_DATA_DIR=/state B1_BUILD_SHA=<fixed-40-digit-sha> \
node --experimental-strip-types qa/r21-uat-server.mjs
```

This entry rejects NODE_ENV=production and unmarked nonempty data directories.
It uses the production App/business/Worker with a visibly synthetic identity.
No formal login/member/account setup is required for this temporary UAT host.
Production server/index.mjs and production auth are unchanged. /api/uat-build
provides build SHA, requirement versions and live data/config fingerprints.

QA: Data/CSV -> complete six values and explicit simulation/user source/version ->
save config -> select correct input stage -> upload manifest-selected stage files ->
Use saved six-field config preview -> commit -> schedule with matching mode ->
query/verify/save/reopen/export. The actual fixture ZIP is supplied with the
controlled delivery, not committed to this public repository.

Task verification: npm run build; npm test; qa/b1-integration.test.mjs;
qa/b1-browser.mjs; qa/issue6-calendar.test.mjs; qa/issue6-integrated.test.mjs;
qa/issue6-browser.mjs and impacted FR013/FR016 regressions. B1_INPUT_DIR supplies
UAT-01/UAT-02 folders; ISSUE6_INPUT_DIR supplies the controlled UAT02 stage.
Expectations use approved constraints and independent CSV facts, accepting any
legal complete schedule. This is Dev self-test, never QA UAT confirmation.

Separate blockers remain original09/B09 formula and original13/14/18/19 customer
facts, plus LIMIT02 inaccessible historical snapshot. They do not acquire invented
PASS, product FAIL or repair rounds. R6 future categories, R8/P1 crossline positive,
DEC04/05/06 implementation and new persistent failure logs remain outside this unit.
