FR-033 / issue #19 / AXIS-LABEL-03 repair round 1 — portable acceptance evidence
Delivery dlv_ee5476c5-0157-4d22-9765-b8ef42ec50ae; same canonical FR033 delivery.
Product repair: a4dfa263f7cf8ca832243d153e39efaf771c6b2e
Branch: feat/fr-033-machine-timetable
Issue: https://github.com/huiliangtao666/APS/issues/19

RETRIEVAL WITHOUT APS-DEV WORKSPACE IDENTITY
This entire directory is committed to the authorized GitHub repository:
https://github.com/huiliangtao666/APS/tree/feat/fr-033-machine-timetable/qa/evidence/fr033-issue19
Use your existing repository access (or the task's attached portable ZIP),
not a Dev workspace URL, preview cookie or copied credential. No public
repository visibility or platform permission changes are required. A private
GitHub repository still requires the recipient's own authorized GitHub access.
The ZIP contains this directory at fr033-issue19/. Open README.txt first.

ALREADY-BUILT BROWSER REPRODUCTION (NO NPM OR SDK REQUIRED)
1. Extract the ZIP locally, or check out the evidence commit from GitHub.
   cd into fr033-issue19/ (Git: qa/evidence/fr033-issue19/).
2. Verify bytes, optionally without Node:
   python3 -c 'import json,hashlib,pathlib; d=json.load(open("SHA256-MANIFEST.json")); assert all(hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()==h for p,h in d.items()); print("PASS",len(d),"file hashes")'
3. Serve ONLY original/ in an isolated read-only container:
   docker run --rm --read-only --cap-drop=ALL --security-opt=no-new-privileges --user 65534:65534 -p 127.0.0.1:8765:8765 -v "$PWD/original:/evidence:ro" python:3.12-alpine python -m http.server 8765 --bind 0.0.0.0 --directory /evidence
   Open http://127.0.0.1:8765/index.html in your own Chrome/Chromium.
   This is a local static server, not a Praetor deployment or preview.
   If Docker is unavailable: python3 -m http.server 8765 --bind 127.0.0.1 --directory original
   Opening original/index.html directly also renders the self-contained HTML;
   localhost HTTP is preferred for consistent DevTools and iframe inspection.
4. Select before and iframe viewport 1100. Select each supported zoom
   0.25, 1, 3, 8 and click the DOM measurement button (#measure).
   Repeat at iframe width 640. Preserve all 8 BASELINE-AXIS console events.
   Before should reproduce overlap at 0.25/1 and right-edge overflow at all
   four scales. SHORT is 7.5/30/90/240px; axis is 30/120/360/960px.
5. Select after and width 1100. Click #matrix (four scales/boundary button).
   Wait for the visible measurement JSON to contain 12 records. Repeat at 640.
   Save the visible #measurements JSON and the 12 AXIS-RECORD console events
   per viewport; capture your own screenshots at the four short-window scales.
   Matrix windows: [0,120), [-1500,3000), [0,240000). Entire axis, including
   offscreen labels, is measured. At the 60000px cap the matrix programmatically
   sets disabled 1/3/8 options; this is instrumentation stress, not human access.
6. Expected after: all 24 dateLabels.minimumGap >= 0 or null, inkOverflow=false,
   axisOverflow=false, immutable=true and errors=[]. Short labels count 0/0/2/4;
   narrow axes show complete start/end above the scroll region without hover.
   Shanghai epoch minute0=2026-11-02 08:00; exclusive end120=10:00. SHORT width
   7.5/30/90/240px and TINY 0.125/0.5/1.5/4px; axis30/120/360/960px.
7. Regressions in after: select zoom8, click SHORT, enter end minute1e12.
   Expect alert, retained axis960px, retained selected SHORT240px and usable
   details. Restore end120: alert clears. Click change-facts (#change-facts):
   current9 ->999, saved fact stays4kg and frozen integrity remains true.
8. Record browser version, OS, DPR, iframe innerWidth, console exceptions,
   measurements and screenshots under YOUR acceptance attribution. Both
   iframe viewports have height820; original Dev outer viewport1920x937 DPR1.
   Those are iframe contexts, not claims of resized OS/browser windows.
   Fonts/OS can affect ink widths: assess overlap and clipping, not exact x/y.
   Use DevTools Console execution context for the selected iframe, not wrapper.
   Copy visible JSON normally or save Console logs; no export endpoint needed.

SOURCE REBUILD IN A DISPOSABLE CONTAINER
The miniature package depends only on react18.3.1, react-dom18.3.1 and
esbuild0.21.5, pinned in package-lock.json. No private SDK or backend imports.
To rebuild without host npm install or writing live app dependencies:
   docker run --rm -v "$PWD:/input:ro" node:22.23.2-bookworm-slim sh -lc 'mkdir /tmp/evidence && cp -R /input/. /tmp/evidence/ && cd /tmp/evidence && npm ci --no-audit --no-fund && npm run check && npm run build'
Both rebuilt HTML SHA256 values must match original/ exactly. The container
removes outputs on exit. For browser inspection of rebuilt output, add your own
empty output bind mount and copy only rebuilt/ there after a successful build.
Internet is needed for initial container images/npm packages; static playback
needs no external API, workspace, identity, credentials or live business data.
Dev used the platform app-exec --validate equivalent, Node22.23.2; see
verification/container-build.txt. No deployed runtime or permission was changed.

SOURCE AND EVIDENCE MAP
source/before/src/* = exact product files at 50a32ef716f4bcd3f72993a2f0125afac9fabce2.
source/before/qa/browser-acceptance.tsx was introduced by delivery commit
8b91a49a9e94290127a264748b0036c50396454f and targets that pinned product.
source/after/* = exact product and synthetic QA entry at a4dfa263f7cf8ca832243d153e39efaf771c6b2e.
provenance/source-mappings.json records commit/path/SHA256 per source file.
The before instrumentation appended after the original document is retained
verbatim in baseline-instrumentation.js. build.mjs reconstructs both exact HTMLs.
The after marker AXIS-LABEL-03-R1-WORKING-SOURCE is an instrumentation label,
not a Git SHA. Source mappings and original SHA manifest establish provenance.
The tiny package is independent of the production app package and lockfile.
Product source, QA fixture, CSS, original HTML and screenshots are unchanged.

DEV ATTRIBUTION / SANITIZATION / HASHES
All dev-captures/* are prior APS-Dev evidence from 2026-10-28 UTC, not independent
Test/Design acceptance. 17 screenshots, 8 before and 24 after records retain
original bytes. dev-captures/validation.log is the original 431-test product
validation log; those tests were not rerun for this evidence-only delivery.
measurement-console.json is a DERIVED whitelist export of parseable synthetic
FR033-MEASUREMENT / AXIS-RECORD / BASELINE-AXIS payloads, deduplicated. It omits
transport target/page IDs, runtime URLs, stacks, unrelated session history and
truncated records. Original unfiltered console/network/snapshot files are NOT
redistributed. Their hashes are retained in provenance/original-file-hashes.json
and provenance/original-manifest.json. Those hash lists are provenance records,
not claims that omitted files are included, safe to share or independently checked.
Original captures include earlier instrumentation errors; final after records
have errors=[]. This export is not a complete zero-error session/network log.
Original full report/issue API responses are omitted to avoid irrelevant identity
metadata. No tokens, cookies, workspace runtime identifiers or live business data
are needed in this package. See verification/sensitive-data-check.json.
SHA256-MANIFEST.json covers delivered files except itself. Commit ID is outside
the content manifest to avoid circular hashes; delivery report records full SHA.

REMAINING ACCEPTANCE BLOCKER
The previous Test report states Dev download HTTP403 and preview HTTP401/no
binding. This package substitutes GitHub/attachment + local static playback;
no claim is made that those protected platform URLs have become accessible.
APS-Test has not yet independently retrieved and executed this package or
returned its own browser evidence/verdict. That independent execution/verdict
is the remaining issue19 browser acceptance step. If Test's environment cannot
open an attachment/local static page and has no authorized repo access, report
that exact retrieval/browser capability failure; do not request Dev credentials
or change platform permissions. No new confirmed Test defect was supplied.
This remains AXIS-LABEL-03 repair round1, not issue18/defect round2. Issue/card
closure, full FR033/AC31/UAT/production identity/persistence and full Done are
not claimed. No new feature, app, card, publication or source fix in this delivery.
