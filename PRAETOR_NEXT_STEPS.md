# Praetor — next steps

Vite + React + Express app `aps-r1` is initialized at `/workspace/apps/aps-r1`.
- Dev: `npm run dev` runs Vite on `0.0.0.0:3000` (SPA) + Express on
  `3001` (API); Vite proxies `/api/*` to Express.
- **Env**: `.env.local` has been seeded from `.env.local.example` —
  edit it to add JIRA/GitLab/Confluence credentials your app needs.
  The PRAETOR_APP_BASE fallback block (commented out by default) is your
  safety net if you ever `pkill vite` + restart from inside the container
  and the docker `-e` env injection is lost. See the file's header
  comments for when to uncomment it.
- Prod: `npm run build && npm start` — Express serves the built SPA + API
  on `3000` in a single process.
- Edit the UI under `src/` (React), the API under `server/index.mjs`.

The recommended flow is **scaffold → wire bridge → dev-preview →
publish → register business skill**. When you reached this scaffold
through the Workbench's「创建应用」dialog or any equivalent
end-user-initiated create flow, steps 2-4 are mandatory — the user
already consented to a Portal binding when they hit submit. Pure
exploratory chat-only invocations may stop after step 2 and ask
before publishing. Step 5 teaches the workspace agent about the
app's commands.

## 1. Verify it starts

```bash
cd /workspace/apps/aps-r1
npm run dev
# leave it running; in another shell:
curl -sf http://127.0.0.1:3000/api/health | jq
# expect: { "ok": true }   (proxied through Vite to Express)
```

## 2. Wire the app-bridge SDK (recommended)

Lets the agent drive the UI (`app.navigate`, `app.click`,
`app.snapshot`, …) AND lets the app push messages back into chat
(`praetor.sendToChat(...)`). One-shot, idempotent:

```bash
# $SKILL_DIR = lite-app-scaffold's installed root.
$SKILL_DIR/scripts/install-bridge.sh /workspace/apps/aps-r1 <appId>
# <appId> must match apps[].id you'll publish in step 4 below — e.g. 'aps-r1'.
```

The bridge import lands in `src/praetor-bridge.ts` and is booted from
`src/main.tsx`, so it runs on every page load.

## 3. Live preview (dev loop — no publish yet)

```bash
$SKILL_DIR/scripts/dev-preview.sh 3000
# Refresh /app/<workspace> — the iframe proxies through nginx to
# your live npm run dev process.
```

Use this loop while iterating. The mapping is in-memory nginx only;
it does not survive a container rebuild — step 4 makes it durable.

**Once the app is bound (step 4), stop starting `npm run dev` yourself.**
The supervisor owns the app's port (a published app runs the production
server there, so a hand-started Vite fails with `Port 3000 is already in
use`). Preview a bound app with `$SKILL_DIR/scripts/dev-preview.sh` and
NO port — the platform runs the dev server on 3000+10 / 3000+11 beside it.

## 4. Publish to Portal (durable)

Use the **workspace-app-builder** skill. Its `publish-app.sh`
script registers this project under `endUserView.apps[]` so the
supervisor auto-starts + restarts it after every container rebuild:

```bash
# $SKILL_DIR here = workspace-app-builder's installed root.
$SKILL_DIR/scripts/publish-app.sh container \
  "aps-r1" \
  /workspace/apps/aps-r1 \
  3000 \
  vite
```

The readiness probe path is left unset, so the platform uses its per-mode
default: `/api/health` in dev (served by Express, reached via Vite's proxy)
and `/` once published — the app's real entry point. `/api/health` is
registered by the framework and returns 200 unconditionally, so it can't tell
a working app from one serving 5xx on every page; if your app has a health
endpoint that means something, set it as the probe path in the publish drawer.

## 5. Register a business skill (auto-doc the app for the agent)

```bash
# $SKILL_DIR = workspace-app-builder's installed root.
$SKILL_DIR/scripts/register-app-skill.sh <appId>
```

Skip if your app exposes no bridge commands beyond the SDK defaults.

## 6. Add sidebar menus (optional, multi-view apps)

```bash
$SKILL_DIR/scripts/publish-app.sh add-menu \
  aps-r1 dashboard "概览" /         📊
```

Each menu maps to a client-side route in your React app (e.g. a
react-router path) that the Portal iframe loads.
