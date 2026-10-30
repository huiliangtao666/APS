FR033 / issue19 / isolated browser dependency recovery
Canonical base: 799f0882e610fca0b6ee1dfe64c52de84a04350a
Delivery: dlv_114d27e9-50e1-484c-afc4-7e53f60acc0f

RESULT: dependency recovery PASS; browser acceptance BLOCKED by sandbox support.
No new browser DOM/screenshots or issue19 acceptance verdict is claimed.

Run commands.txt from the workspace root. All npm operations run only in the
platform's --validate disposable app container, as uid503, Debian12 arm64.
No system packages are installed. Nothing is promoted into live dependencies,
dist, app data, publication, previews, cards or platform configuration.

qa/fr033-browser-runtime.sh restores 59 pinned packages by HTTPS URL/SHA256
from qa/fr033-browser-dependencies.json, extracts with dpkg-deb -x into a
task-local /tmp prefix, and scopes library/font/browser caches to that prefix.
The supported baseline is the inspected Debian12 arm64 Node22.23.2 app image;
this is not a portable glibc replacement or an amd64 package collection.
No package maintainer scripts run; the host libc/loader remain in use.
Existing browser PATH entries and readable standard Playwright caches were
inspected; none were reusable in this disposable runtime.

The lock was generated with isolated APT indexes and archives, Debian archive
keyring verification, and SHA256 comparison with the authenticated indexes.
The first HTTPS APT attempt lacked CA certificates. Rather than disable TLS,
the resolver used Node's bundled public trusted root certificates in a temp
PEM. Image APT cleanup hooks were excluded using a task-specific APT_CONFIG.
To intentionally regenerate a lock in a new validation copy, source the runtime
with FR033_DISPOSABLE_VALIDATION=1 FR033_RESOLVE_DEPENDENCIES=1. Its single
DEPENDENCY_MANIFEST_BASE64 stdout record contains the new lock; review versions
and checksums before replacing the committed lock. Normal runs never resolve
new package versions. Debian mirror expiry yields an explicit failure, not an
automatic fallback to unpinned libraries or another network destination.

Preparation required two dependency sets: 32 original missing libraries, then
59 packages including libcups2/libcairo2/libpango-1.0-0 and their dependencies
for full Chromium. browser-final.log confirms no ldd 'not found' entries.
Playwright1.56.1 downloads Chromium141.0.7390.37/build1194 arm64 from its normal
HTTPS CDN into the task prefix. The binary hash is in result.json and the log.
Browser and library binaries are not shipped in this delivery.

The existing realApp browser runner's --no-sandbox argument was removed.
All launchers now request chromiumSandbox:true. The probe reaches Chromium,
which exits SIGTRAP with 'No usable sandbox!'. The nonroot namespace probe
returns EPERM, with Seccomp2 and no effective capabilities. These observations
do not establish which policy denies namespaces. No policy bypass was tried.

Minimal operator requirement: provide an approved disposable QA runtime that
supports nonroot Chromium sandboxing (working user namespaces or an approved,
pre-provisioned sandbox). Retain platform/browser/network policies. No host
package install, root changes, daemon action or live-app change is requested.

After launch succeeds, recovery.sh proceeds in the SAME disposable container:
1. Run exact committed issue19 before/after HTML, verifying its SHA256 manifest.
2. Measure/capture iframe widths640/1100, height820, four zooms0.25/1/3/8;
   run after matrices and HISTORY01/ZOOM01/WINDOW02 checks. New screenshots,
   DOM, browser provenance and measurement JSON go to FR033_EVIDENCE_DIR.
3. Run existing realApp browser acceptance against synthetic isolated data.
The added component browser script passed syntax checks but could not be
executed past the sandbox launch prerequisite. It is not browser-validated.
Artifacts exist only within that disposable container and are removed at exit;
the current platform finite-exec interface returns logs, not artifact files.
An operator rerun requiring retained images needs an approved QA artifact
collection facility; do not write them over the live workspace from QA.

Nonbrowser checks were independently rerun in another disposable container:
npm test 89+123, timetable/HISTORY01 29, timeline panel11 =252 passed,0 failed.
TypeScript/Vite/server/worker production build passed. RealApp API smoke passed
canonical product-source hashes, import/calculate/save/refresh, downtime and
precedence, tooling/personnel/space, immutable saved40/current50 quantities.
The first verbose log exceeded the platform's bounded response, so checks were
rerun with concise per-command summaries. checks-final.log is complete and ends
APP_EXEC_EXIT=0. No independent Test/Design browser verdict is substituted.

Logs describe only synthetic validation data and public dependency downloads.
result.json is the machine-readable result. SHA256-MANIFEST.json covers this
evidence directory and new/changed QA scripts, excluding the hash manifest.
The ordinary Git push and full delivery SHA are reported separately to avoid
circular commit hashes. No giant evidence repackaging is included.
