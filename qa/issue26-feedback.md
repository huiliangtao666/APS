# Issue26 / FR038-A05 round 1 viewport feedback

Scope: v0.3 FR038 plus CR-FR038-PERF-20261029; this regression checks visible save feedback, not formal AC27 timing. Original dispatch: dlv_775a1c4c-3f07-4adc-84a4-ad1ae8403d8c:c1.

`issue26-feedback-browser.mjs` adapts the Test2 A05 probe, using real React, Express and membership with the existing synthetic planner identity adapter. The original 512-order store comes from Test2's evidence ZIP `saved-business.json` (plan JSON hash 4383e3bed36cecd80e302fb40aa2991442fc0ea088e504de2e8a47a07f41f287). No production identity or business UAT is claimed. Tests use an isolated store and never modify the supplied fixture.

Run `qa/issue26-docker.sh` with absolute paths in ISSUE26_REPO, ISSUE26_FIXTURE, ISSUE26_SDK and an empty ISSUE26_OUT; set PRODUCT_SHA to the tested commit. Optionally set ISSUE26_IMAGE=aps-fr038-qa-runtime:latest to reuse the existing dependencies/browser. All app commands execute in the disposable container, limited to 2 CPU / 4 GiB. The default image installs lockfile dependencies and Playwright 1.56.1 inside that container.

The probe opens the existing 512-order/1024-task run, scrolls to the save button and performs a normal Playwright click, without force. It asserts that the entire toast rectangle is in the viewport, does not overlap save, and its close button passes hit testing and a real click. Success, actual server reason-required failure, retry, unchanged plans/input state and reopening are checked. Then an isolated small fixture is calculated through the real API; save/reopen and narrow-screen success, simulated 503 failure and retry are checked. The 503 response is explicitly injected at the browser transport; the reason-required rejection comes from the real server after the test strips only the request reason. Neither failure may alter persisted store bytes.

Evidence includes viewport screenshots, geometry, hashes, HAR, request events and resource samples. In baseline mode (`PROBE_MODE=baseline`) the large success is expected to be outside the viewport; use parent product source with this probe copied into its qa directory. The baseline failure is already independently recorded by Test2 at 8741bf0a597fa11838a514259d8ffe7980382ee2.

The shared App message surface now stays in the viewport; callbacks, APIs, storage, existing plans and business rules are unchanged. No timer hides errors automatically. Long text wraps and scrolls within a bounded height; the close button has an accessible label. Independent Test must assess the new commit; old PASS remains attached to the old SHA.
