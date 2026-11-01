Fixed48e restricted preview wrapper — #47 continuation r2
event_key=b15:user-preview-wrapper-implementation:20261101:r2

STATUS AND SCOPE
Source/offline tool selftest only. Actual binding, preview activation, product
HTTP, browser smoke and user URL: NOT_EXECUTED. QA17-USER-ENTRY-02 OPEN;
ENTRY01 remains CLOSED. No product FAIL/repair-round increment.

This is a mock planner gateway for existing authorized APS-Test preview
members, not a formal SSO or a role-switch UI. Every request must first pass
the official @praetor/lite-app-server >=0.4.1 verifyRequestActor(). Then its
issuer#sub must occur in the operator's exact existing-preview-member list.
An arbitrary signed-in user, machine actor, raw HTTP request, test-sub,
b15Role, plain x-praetor headers or browser viewer hint cannot enter.
No platform credential, signature or user is minted by this wrapper.

OFFLINE VERIFICATION (existing dependencies; no install)
  cd /Users/sg_cbb_mac_1/praetor-workspaces/APS-Test/apps/b09-bom-loss-config
  node qa/b15-user-preview-selftest.mjs
The temporary loopback upstream is synthetic. The production listener is not
started. Routing positives use a synthetic internal actor; real SDK tests
prove rejection of unsupported/missing/forged context, not a real signed
user success. No result here is product smoke or user-entry evidence.

IDENTITY/PREFIX CONTRACT AND EXACT REMAINING FIELDS
Official local skill: .codex/skills/lite-app-managed-identity/SKILL.md.
Platform /api/platform/capabilities advertises managed identity login/logout;
that does not establish identity injection into an unpublished dev preview.
Own app-identity read currently returns 403 Insufficient permissions. No new
runtime was started to probe it. The Python-only old proposal has no supported
stdlib signature verifier. Minimal code alternative implemented here: the
Python launcher execs Node, using the existing official 0.4.1 SDK. This keeps
the python stack's supported dev-preview launcher and a single process.

Platform-owned, injected into the target runtime, never copied from an agent:
  PRAETOR_APP_INSTANCE_ID
  PRAETOR_APP_CONTEXT_ISSUER
  PRAETOR_APP_CONTEXT_KEYS       JSON [{kid,publicKey}], actual platform keys
  PRAETOR_APP_DEPLOYMENT_GENERATION  actual generation, when supplied
  PRAETOR_APP_BASE              actual signed/stripped platform app base
Per request: X-Praetor-App-Context signed by that platform for this instance,
generation, issuer, method and target. SDK checks signature, expiry, audience
and target. Missing identity config -> 503 unsupported; missing/forged token
-> 401. The SDK accepts only exact seen or exact injected-base+seen target.
If dev-prefix stripping yields a different signed target, reject with
target_mismatch. Do not override platform keys/base or widen signed targets.

Operator-provided, after confirming the target user's existing preview access:
  B15_PREVIEW_MEMBER_KEYS       JSON ["actualIssuer#actualExistingHumanSub"]
  B15_PREVIEW_PUBLIC_ORIGIN     exact HTTPS public origin from the platform
  B15_PREVIEW_BASE              exact returned devBase path, with trailing /
  B15_PREVIEW_SDK_ROOT          /workspace/apps/b09-bom-loss-config
  PORT                         injected by platform; no fixed launcher port
Empty member list admits nobody. No public origin, member key or user URL is
pre-filled. The operator must verify that SDK_ROOT exists inside the approved
new runtime and contains >=0.4.1; no host install is permitted.

If unpublished preview supplies no signed contract, THIS ROUTE STAYS CLOSED.
The minimal platform alternative is platform support for the existing signed
request context on that authorized preview, including its dev target/base.
That is a platform capability gap, not permission to publish Managed identity,
invent a verifier, forward platform session cookies, trust an Origin as a
user, or fall back to the unguarded candidate. Operator/PM must resolve it.

PREPARATION AND EXACT FUTURE COMMANDS — NOT EXECUTED BY THIS DELIVERY
First review the source and resolve the fields above and user binding approval.
After Dev's main integration, retain its actual source SHA; the serving product
remains 48e0766d9733eff99f9bc3f0718639aab89fcf0e with parent
4bd4972efb45a2c5892107fdc6011203ace4a14e. Do not serve moving main as product.

1. Prepare the dedicated directory; refuses differing existing files:
  python3 qa/b15-user-preview-control.py prepare \
    --destination /Users/sg_cbb_mac_1/praetor-workspaces/APS-Test/apps/qa17-48e-user-entry
Copies only the five wrapper runtime files. No state/auth/native data copy.
For offline review now, use a directory under temp/b15-user-preview-r2 instead.
After the state owner's final RELEASED and specific snapshot/activation approval,
take the complete protected state (includes business frozen/native/history and
auth) into a NEW private directory before exposing writes:
  python3 qa/b15-user-preview-control.py snapshot --execute-approved \
    --state-root /Users/sg_cbb_mac_1/praetor-workspaces/APS-Test/temp/b15-runtime-state-17 \
    --destination /Users/sg_cbb_mac_1/praetor-workspaces/APS-Test/temp/b15-user-preview-r2/activation-state-protection
It rejects symlinks, overwriting and >128MiB; verifies streamed source/copy
hashes. Hold the exclusive window during the copy; hashes are not a filesystem
transaction. Keep this private auth/state snapshot out of Git and reports.
This delivery tested only synthetic snapshot files, not the real state.
2. In the approved runtime, with operator fields and genuine injected identity,
   configuration-only check (no listener or upstream HTTP):
  python3 b15-user-preview-launch.py --check
3. After concrete authorization, supported bind via the control command:
  python3 qa/b15-user-preview-control.py bind --execute-approved
Equivalent argv: workspace-app-builder/scripts/publish-app.sh container
  qa-fr006-main-3d164d5 /workspace/apps/qa17-48e-user-entry 4318 python
  'python3 b15-user-preview-launch.py'
The script's default WAB directory is this workspace's .codex skill directory;
use --wab-dir with its absolute path if the source is moved. No publish call.
4. After QA/Dev release their exclusive runtime/state window, and only with
   the same activation approval, run the official skill script:
  /Users/sg_cbb_mac_1/praetor-workspaces/APS-Test/.codex/skills/lite-app-scaffold/scripts/dev-preview.sh
Take devBase / printed Workbench URL verbatim. The public deployment origin
and prefix must come from the platform/Workbench, not the control API broker,
22924/23563/18252, localhost, an internal address or an Agent Browser URL.
Never strip or reconstruct the platform's deployment prefix by guessing.
The platform's start may allocate devBase only after launch. If configuration
is then incomplete, keep the wrapper closed, set the exact approved values
through the supported configuration flow, and only use a separately authorized
wrapper runtime refresh. This delivery does not start or refresh any runtime.

PERMITTED USER PATH AFTER ACTIVATION/IDENTITY ACCEPTANCE
Open exact user preview -> check fixed48e/scene17 and mock-planner banner ->
open existing seed plan 54be2e2b-af50-4a80-973d-4f02784f68e9 -> enter a reason
and explicitly copy to a new independent trial -> calculate that trial once ->
wait for a terminal run -> view resulting new plan -> save and read back ->
optionally export that plan. These are the later necessary short-smoke steps;
no eleven-business/67-row retest is required here. Final business UAT is user-led.

BOUNDARIES AND KNOWN LIMITATIONS
- Fixed upstream is only http://host.docker.internal:18252. Every request checks
  full source SHA/parent/buildSource/source-manifest/scene17 profile/UI hashes;
  served static bytes are hashed before HTML adaptation. Drift/redirects fail.
- Root HTML is fetched as raw /index.html, verified, prefixed and given a small
  URL shim before the product module. No product JS/CSS/source build/edit.
- Only allowlisted read paths/static scene17 files pass. __qa, auth and platform
  management never pass, including encoded/path-normalized alternatives.
- Copy only the fixed seed. Global input/import, configuration, current-data
  calculate, old trial edits, restore, release/confirm/archive are blocked.
  New-trial inputs, one serial async run, its result save, retain/discard and
  plan CSV export retain upstream permission/action/reason/CSRF enforcement.
  No arbitrary body id creates a write grant. Initial inventory protects all
  pre-existing IDs. Existing foreign pending runs block new calculation.
- External cookies/auth/identity/forwarding headers are discarded; only the
  internal explicit mock test-sub=planner plus approved business CSRF headers
  pass. Upstream Set-Cookie, CORS and redirects never reach the browser.
- Read/refresh recognizes owned terminal runs from both run list and detail.
  Wrapper ownership is in memory. Restart revokes prior write grants; old/new
  user data remains readable, and continuing writes require a fresh seed copy.
- Product UI still contains controls for blocked global/admin/uncovered actions;
  they receive an explicit denial. Use the independent trial path above. Retry,
  synchronous calculate, position previews, supervisor workflow, report/query/
  run CSV variants and global editing are outside this restricted preview.
- Real signed preview admission, prefix behavior in its gateway/nginx, browser
  module loading, real product APIs, saving/reopening/export remain NOT_EXECUTED.
  Tool tests cannot certify user reachability or preserved real runtime bytes.
- A successful upstream write followed by a lost/invalid response is not undone;
  inspect the new object before retrying. No automatic restore deletes new data.

ROLLBACK — CONFIGURATION ONLY, AFTER ITS CONCRETE AUTHORIZATION
  python3 qa/b15-user-preview-control.py rollback --execute-approved
Equivalent: publish-app.sh container qa-fr006-main-3d164d5
  /workspace/apps/qa-fr006-main-3d164d5 3000 vite 'npm run dev'
No dev-preview, restart, stop, daemon command, publication or state restore is
issued by rollback. It may change the platform runtime on a later cycle; the
old stopped preview is not proactively started. Preserve all user-added trials,
plans and audit records; any data recovery needs a separately chosen recovery
point after saving new user data. This script never restores data snapshots.
