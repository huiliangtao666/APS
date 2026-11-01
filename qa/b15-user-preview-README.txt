#47 minimal unpublished workspace entry — r3
original_delivery=dlv_fa72c95d-9147-48ec-86a9-b395fedb3dc9
event_key=aps:preview-minimal-workspace-entry:20261101:r3

RESULT
Only original wrapper source/configuration differences and six groups of
synthetic incremental checks. Actual binding/start/user admission/product
HTTP/browser/Worker/build: NOT_EXECUTED. actual_user_url=null.
QA17-USER-ENTRY-02 stays OPEN. No product failure or repair-round increment.
The old 48e lock and historical PASS remain on their original SHA; this is an
explicit integrated0afa candidate profile, not a new product build or migrated PASS.

SUPPORTED ACCESS MODEL AND EVIDENCE
workspace-app-builder/SKILL.md lines 122-140: unpublished previews normally
return 401 anonymously; authorized workspace session cookies in the Workbench
iframe reach the app. Lines 190-211: container binding manages one process,
which may forward through host.docker.internal to a compose host-loopback port.
Lines 220-245 and app-runtime.sh: Agent Browser URLs and human Workbench URLs
have distinct path contracts; keep the platform-returned devBase and deployment
prefix. Do not use a loopback URL as a human URL or external-source binding.
lite-app-managed-identity/SKILL.md: official signed identity applies to apps
published with Managed identity, not every unpublished preview. No new accounts,
member database or signed-context injection is needed for workspace preview.

The supported workspace model trusts ONLY the platform's existing session/ACL
gate and platform-only network ingress. The wrapper does not authenticate a
platform user. Config mode=workspace-preview is explicit; admission remains
closed without reviewed evidence for this exact unpublished workspace route.
No Origin, plain identity header or cookie substitutes for that platform gate.
The random HttpOnly/Secure/SameSite=Strict cookie owns only new browser copies;
it has no role or platform identity. It is bounded in memory (128 scopes/8h).
A new browser scope cannot write another scope's copies. Logout/account changes
inside the same browser are not attributed to named platform subjects; use a
fresh browser profile for another user. Formal named-user ownership/approvals
remain the Managed identity contract.

READ-ONLY PLATFORM OBSERVATION THIS DELIVERY
GET workspace APS-Test: lite-app, servicePort=22924, existing sole binding
qa-fr006-main-3d164d5, published=false, cwd=/workspace/apps/qa-fr006-main-3d164d5,
port3000/vite/npm run dev. Dev runtime: stopped/idle-reaped, running=false,
finished2026-10-31T13:57:12.313Z. This is the stopped appID to reuse.
The official help workspace-settings confirms the authenticated preview tunnel;
node app-container.js maps managed listeners on random host-loopback ports only.
A bare request to the injected platform origin and existing dev base failed
No route to host (errno65), before any HTTP response. Thus NO anonymous401,
authorized-session200 or real app reachability was observed here. Configuration
alone does not certify this deployment's ACL. Actual gate verification remains
the single platform access-chain gap. Do not invent a signed-identity blocker.

FIXED PRODUCT AND PROFILE DIFFERENCE
candidate=aps-dev-parameter-ui-0afa-r1
productSha=0afa7a85dc17a856f11568de8886ab1e32f78d6f
parent=92bb1b4bda644b7a6f1d9f1d0fab5ab0c2002d3b
upstream=http://host.docker.internal:18302
fingerprint=/api/parameter-ui-deployment
sourceManifestSha256=9e8c4b9c16c8d3b6501743b05cb924c697ec150158db7da87dd2f4fadbc14c77
adapterSha256=df34f9d4ae3cee32a0ceba697f707a65db10e632f21f9a66f64ef0d02ffdee97
seedPlanId=1ab5af9a-d5c4-4ce4-beef-c4e7fe04e779
source evidence=https://github.com/huiliangtao666/APS/issues/41#issuecomment-6558273715
PM verification=https://github.com/huiliangtao666/APS/issues/41#issuecomment-6558305071
Dev45=https://github.com/huiliangtao666/APS/issues/45#issuecomment-6556402362
These are recorded fingerprints, not product probes performed by APS-Test r3.
The recorded adapter verifies source/build bytes at startup. Every wrapper
request pins source/parent/manifest/adapter/build.source_sha; static bytes are
hashed against that adapter's build.files. First accepted manifest is stable
for the wrapper lifetime; changed manifests fail. No 0afa dist hash is invented.
The 48e profile still uses its original18252/uat-build/scene17 lock. Production
managed-identity remains the default mode and official SDK>=0.4.1 verification;
missing signed config still gives503 unsupported, missing/forged context401.

ONE ACTION REQUIRING USER APPROVAL
Approve reuse of the stopped qa-fr006-main-3d164d5 unpublished preview binding
and activation of this restricted 0afa workspace entry, including platform gate
verification and setting the returned URL configuration, after QA releases its
exclusive window. This is one concrete activation action. No publish, product
restart/hot replacement, state/dist changes or identity provisioning is included.
Until approved, all commands below are proposals, not executed actions.

EXACT SUPPORTED PROCEDURE AFTER THAT APPROVAL
Run from the integrated source checkout; use its fixed wrapper SHA, not a
moving product checkout. Prepare five runtime wrapper files, without state:
  python3 qa/b15-user-preview-control.py prepare --destination /Users/sg_cbb_mac_1/praetor-workspaces/APS-Test/apps/qa17-0afa-user-entry
One supported binding/start sequence, using the existing appID:
  /Users/sg_cbb_mac_1/praetor-workspaces/APS-Test/.codex/skills/workspace-app-builder/scripts/publish-app.sh container qa-fr006-main-3d164d5 /workspace/apps/qa17-0afa-user-entry 4318 python 'python3 b15-user-preview-launch.py' && /Users/sg_cbb_mac_1/praetor-workspaces/APS-Test/.codex/skills/lite-app-scaffold/scripts/dev-preview.sh
Python execs Node as the single process; PORT is platform injected. Platform
lite-app images provide Python/Node; workspace mode needs no npm dependencies.
No hand-started host process, dependency installation or extra proxy is used.
The wrapper listener returns503 while deployment configuration is absent. The
platform dev start waits for TCP readiness; this503 is deliberate closed state,
not proof that user entry is ready. On runtime/readiness failure, use only the
official app-diagnose.sh --dev; never start a second process or touch18302.

Take devBase from the actual dev-preview response / printed Workbench URL.
Obtain the human URL from the Workbench preview UI, preserving its public
origin/deployment prefix. Never reconstruct it from broker URL, internal18302,
servicePort, Agent Browser URL or remembered /praetor prefix. In this delivery
there is no actual returned URL. QA will perform product smoke separately.

Before enabling business forwarding, verify the exact returned route: naked
request401, entitled workspace session reaches the closed wrapper503 (or200
on later recheck), unpublished binding and platform-only ingress/ACL intact.
Use the Workbench user's own session, without exporting/copying cookies or
creating a second account. Record actual observations in a private JSON file:
  {"workspaceId":"APS-Test","devBase":"<exact returned devBase>",
   "origin":"<exact public HTTPS origin>","anonymousStatus":401,
   "authorizedSessionStatus":503,"platformOnlyIngressVerified":true}
These are required observed values, not a fixture to fill as PASS. A503 alone
is insufficient: verify it is the wrapper's preview_configuration_closed body.
If no gate evidence is available, retain closed503 and report that exact gap.
Then save reviewed deployment config; no restart or new state is needed:
  python3 qa/b15-user-preview-control.py configure --execute-approved --destination /Users/sg_cbb_mac_1/praetor-workspaces/APS-Test/apps/qa17-0afa-user-entry --dev-base '<exact returned devBase>' --origin '<exact public HTTPS origin>' --gate-evidence '<private observation JSON path>'
Configuration reload revokes previous scopes. These parameters are deployment
configuration, not authorization or identity. Changes to access mode, publication,
workspace ACL or direct ingress require closing the entry and revalidating it.
No other route may expose this wrapper anonymously. Actual real-ingress and
host.docker.internal18302 reachability are not inferred from offline checks.
If this chain cannot be guaranteed, this implementation stays closed; the
minimal alternative is the platform's same unpublished authenticated container
tunnel repaired/verified by its runtime owner, not Managed identity publication.

RESTRICTED USER FLOW AND SAMPLE PROTECTION
Open the returned URL; confirm0afa/mock-planner banner and fingerprint. Open
the existing R7 sample plan and enter a reason to copy it. Edit only the new
trial; calculate serially; wait for a terminal result; save/read/export that new
plan. Original inputs/history/frozen/native and old plans are never write grants.
Only fixed seed copy creates trial/basePlan grants; only that scope's new run
can create result grants. New arbitrary body IDs cannot claim existing objects.
Existing pending runs block calculation. CSRF Origin, X-APS-Request, JSON/action
and reason checks stay in place, followed by product membership/action/CSRF.
External auth/session/role/forwarding headers and cookies are never forwarded.
Only constant parameter-ui-role=planner is sent internally to the explicit mock
adapter; its supervisor default cannot leak through the wrapper. Auth/QA/role
switch endpoints, global inputs/import, current-data calculation, approval,
archive, restore and all other unlisted actions remain blocked. Upstream
Set-Cookie/CORS/redirects do not pass. Browser scope cookies are wrapper-owned.
The existing product UI still shows blocked functions; this is the stated
restricted trial scope, not a full supervisor workflow or67-row/UAT acceptance.
Business writes append user data on Dev's existing candidate state. Old sample
objects are inventoried and protected; data is not migrated or restored here.
Wrapper restart revokes write grants; keep new user objects and copy seed again.
Do not promise new objects are recoverable by the same scope after restart.

ROLLBACK AND LIMITATIONS
Close forwarding by removing the local reviewed deployment config (next request
returns503); this neither stops nor restarts18302. Restore binding configuration
only with the control tool rollback --execute-approved, equivalent to:
  publish-app.sh container qa-fr006-main-3d164d5 /workspace/apps/qa-fr006-main-3d164d5 3000 vite 'npm run dev'
This is a configuration rollback, not runtime/state recovery. Do not start the
old app as a side effect during this delivery. Never delete user-created trials,
plans/audit or overwrite shared candidate state; actual state recovery is owned
by Dev/PM in a separately chosen maintenance window with new user data preserved.
R7 optional whole-input restore already hit protection400/409; no online whole
state rollback is promised. Existing COPY-01 and UI-CATEGORY-TABLE-01 followups
keep original owners and evidence. No new business issue or product repair.

INCREMENTAL CHECK
  node qa/b15-user-preview-selftest.mjs --incremental
Six synthetic groups cover mode/gate closure,0afa dialect/assets,role stripping,
new-browser scope isolation,CSRF/run/save and managed SDK unsupported rejection.
Original21 checks are not repeated or re-labelled. No fake result is a platform
session success, real18302 access, product/browser smoke or user-entry closure.
