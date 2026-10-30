FR006-MAIN-ENTRY-01 repair round 1/2

Candidate source is the root application on `fix/issue3-fr006-main-entry-01-r1`,
direct parent `e0be9b6dfbf9be7ce404edc1b80d8c50858ed3dc` from
`feat/fr-013-016-main-batch`. This is not the independent configuration prototype.
The failed main pin `3d164d5e3c19ef64c24646bbc978031c054255e4` has only the older
R2.1 root product. Main `6b7c103` differs from that pin only in controlled docs.
No main merge is part of this delivery. Checking out main still reproduces the
old missing capability; independently test the exact candidate root SHA.
Do not transplant only this patch onto old main: the candidate deliberately
reuses the already delivered server/identity/version/CSV/Worker implementation.
All pre-existing candidate limitations and old evidence retain their original SHA.

Root navigation: 工装配置 → edit table 18; 数据与 CSV → 工装配置 entry;
查询工装配置 opens the existing current/historical query component. Occupancy
and rule links open table 23 and the existing rule editor. New rows are blank,
with no new business defaults. Actual scheduling still requires explicit claims,
parameter source, an enabled/adopted MOLD rule, and supported scheduling mode.

Original nine-column 18_工装配置.csv remains accepted by the pre-existing CSV
compatibility contract. Its omitted availability bounds retain the already
implemented simulation migration [0,525600); these are NOT approved site values.
The policy preview labels this migration as simulation / awaiting confirmation.
New eleven-field records expose the bounds for explicit editing. This repair
adds no default, automatic seed copy, occupancy strategy, or new migration.

Pure field validation now belongs to src/lib/tool-validation.mjs; the product no
longer imports that validator from prototypes/. Constraints are reused, and
errors retain actual row/field through business validation and physical CSV line
mapping. The prototype source and original CSV bytes remain unchanged.
Tooling CSV save completion is also visible after the revision-triggered remount.
The export anchor is temporarily attached to the DOM and its Blob URL is released
after the browser has had time to consume the click. Existing export gates remain.

Reproduction with prepared disposable QA image (Docker on application node):

    mkdir /absolute/new-empty-evidence
    FR006_REPO=/absolute/github-checkout FR006_OUT=/absolute/new-empty-evidence \
      bash qa/fr006-main-entry-docker.sh

The prepared `aps-fr038-qa-runtime:latest` provides Node, SDK dependencies,
Playwright and Chromium; exact image ID is in qa-image-id.txt. Source is read-only,
then copied into the image's app directory. The root app is built with the
existing synthetic runtime alias in qa/fr027-fixture.mjs, genuine Express role
middleware and temporary business files. Tests start their own isolated fixture
servers; they do not attach to the live Portal or modify live data/dependencies.
This is actual browser evidence for the root app, not Portal SSO evidence.
The launcher requires a clean committed source and records SHA plus file hashes.
A clean independent environment may install the repository's locked dependencies
and platform SDK in its application container, then run the same commands.
Do not install dependencies or start application processes on the VM host.

Validation: standard build and npm test, 17 focused API/rule checks, 10 actual
browser groups for root entry, CRUD, persistence/query, original CSV rejection
and confirmation/export, changed new Worker behavior with frozen old history,
and read-only query role. Counts overlap; they are not independent acceptance.
Browser records the requested download name and the engine's suggested name
separately; CSV bytes are saved and checked. Chromium in this prepared image may
suggest `download` despite the anchor requesting 18_工装配置.csv.

Scope remains the main-entry repair, not all FR006/CR assertions. Single continuous
resource windows, existing executed-resource-ledger limitations, broader shared
resource/CR combinations and business UAT remain for PM's existing records.
No Test/QA verdict, Done, main merge or publication is inferred from Dev results.
