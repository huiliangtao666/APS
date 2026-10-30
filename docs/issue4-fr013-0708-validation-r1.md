# Issue4 / FR013 原07/08 validation repair round1

Source dispatch: `dlv_50c139f5-bc21-4c22-adad-294f147b9055`; PM key `issue4:fr013:0708:validation:r1:20261030`.
Requirement: APS-BL-001 v0.3 + effective CR-FR013-VALIDATION-20261029. Original Issue4 comment: https://github.com/huiliangtao666/APS/issues/4#issuecomment-6513061109 . Project2 original FR013 item: PVTI_lAHOFM9WU84BpE1czhEHgrg.

Parent: `e0be9b6dfbf9be7ce404edc1b80d8c50858ed3dc`, latest checked origin/feat/fr-013-016-main-batch. Relative to Test2 failing `1cdf394eb954cd6ff15a48cc052edb64f6f093b4`, parent adds only the personnel-post implementation; its CSV, validation, scheduling and verification changes are retained. This repair uses an isolated branch, with no changes to those files.

Root cause: master validation checked positive finite numbers but did not enforce integer bag counts or the yield cap on this branch. Reuse only the approved numeric guard and field guidance from fc273441ca93dcc47996bf5a6f7031e73be7f226, without merging its branch. Decimal text is checked exactly, so 1.0000000000000000001 cannot round to an accepted 1. 12.0 is an integer value; 0.96 is 96%, 1.00 is 100%. Input text is not rounded or converted. No new defaults or material enums.

Both CSV preview and commit, direct table/input edits and new runs use shared master validation. CSV errors retain table/index/field and map through existing physical-line mapping. Invalid previews have no confirmation token; forged confirmation returns 409 without writing. Server-owned valid preview files are reparsed and validated at commit. Existing query permissions, audit/versioning and historical read behavior are unchanged. Batch, single-table, editor and downloadable template guidance describe the same constraints; CSV header shapes remain unchanged.

Validation in disposable Docker aps-fr038-qa-runtime:latest (Node v22.23.2): build PASS; 18 targeted tests PASS (7 CR validation, 6 existing 07/08, 5 personnel-post regression); npm test 124 PASS; four real built React/Express browser groups PASS on Chromium Headless 141.0.7390.37. Exact dispatched 8.5/1.01 dual-file scenarios reject at physical line4 with entire storage unchanged; 8 and 1.00 persist. Includes boundaries, invalid direct saves/trial inputs, permissions, audit/version, new Worker config adoption, old real supervisor-confirmed snapshots and storage reload. Synthetic QA actor and runtime alias are used; this is Dev self-test, not independent Test or UAT.

Reproduce from this fixed commit in an environment with the named QA runtime image:

```sh
FR013_REPO=/absolute/checkout FR013_OUT=/absolute/evidence bash qa/fr013-0708-validation-checks.sh
```

The runner overlays fixed tracked source into a disposable image with dependencies installed, builds fresh frontend/API/Worker and installs a matching headless browser. It does not change the live preview. The raw evidence archive also contains parent reproduction, exact API requests/responses, browser DOM/screenshots, authority snapshots and source fingerprints.

Delivery is Dev PASS for this repair only; original FR013 remains NOT_READY, UAT WAITING_DEPENDENCIES. PM must assign independent Test for the two failure assertions and adjacent boundaries, zero-write/physical-line/React/history behavior at the new fixed SHA. Existing Test1 45 PASS and Test2 13 PASS remain on their original SHA. No main merge or publish, no QA UAT, no contact with APS-Design. Repair count is 1/2 for this specific two-assertion validation defect; other defects retain their own rounds.
