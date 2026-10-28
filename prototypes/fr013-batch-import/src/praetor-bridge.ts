// Praetor app-bridge singleton. Vite apps are client-only (no SSR), so this
// boots straight on import — `src/main.tsx` imports it before rendering.
// `init()` is idempotent, but we also gate on a module flag so React
// StrictMode's double effect can't fire two init envelopes.
//
// GENERATED FILE — install-bridge.sh may regenerate this on SDK upgrades.
// Put app-specific `praetor.onCommand(...)` handlers in your components,
// NOT here. The binding ID comes from Praetor at runtime, not this build.
import { praetor, sendToChat, suggest, notifyContext } from "./lib/praetor/praetor";
import { applyPraetorRuntime } from "@praetor/lite-app-runtime";

// Edge-routing fetch shim — patches window.fetch so any `/api/*` call gets
// the Vite base prefix at request time (no apiPath() refactor needed). No-op
// when the base is `/` (standalone `npm run dev`).
//
// The base MUST be passed from here (app code), NOT read inside the package:
// Vite only replaces `import.meta.env.BASE_URL` in the app's own source, never
// inside node_modules deps (in dev they're pre-bundled / served untransformed).
// So the package-internal default would read `undefined` → empty base → the
// shim silently no-ops → every `/api/*` 404s under `/praetor-app/<port>/`.
// Passing it explicitly here keeps the shim working in dev AND prod.
// See docs/lite-app-edge-routing.md §6.
applyPraetorRuntime({ base: import.meta.env.BASE_URL });

let started = false;

export function bootBridge(): void {
  if (started || typeof window === "undefined") return;
  // Praetor adds this non-secret ID to every bound iframe URL. Keep it on
  // this browsing context so a full same-frame navigation/reload that drops
  // the query string still uses the same binding. A different iframe can use
  // the same app bundle with a different ID. The host validates every frame.
  const params = new URLSearchParams(window.location.search);
  const fromHost = params.get("praetorAppId");
  if (fromHost) window.name = "praetor-bound-app:" + fromHost;
  const appId = fromHost || (window.name.startsWith("praetor-bound-app:")
    ? window.name.slice("praetor-bound-app:".length) : "");
  if (!appId) {
    if (window.parent !== window) console.error("Praetor app bridge: missing runtime appId; open this app through its Praetor binding.");
    return;
  }
  started = true;
  praetor.init({ appId });

  // Default handlers. Override / add more in your components via
  // `praetor.onCommand("name", handler)`. The host's MCP `app.<cmd>`
  // calls land here.
  praetor.onCommand("ping", () => ({ status: "ok", ts: Date.now() }));
  praetor.onCommand("snapshot", () => ({
    url: window.location.href,
    title: document.title,
  }));

  // The Portal / Workbench appends ?praetorEmbedded=1 to embedded iframe
  // URLs; expose it as a <html data-praetor-embedded> attr for CSS hooks.
  if (params.get("praetorEmbedded") === "1") {
    document.documentElement.setAttribute("data-praetor-embedded", "true");
  }
}

// Self-boot — importing this module is enough.
bootBridge();

// ── app → chat: the primary way your UI talks to the agent ────────────
// Re-exported so components can: import { sendToChat } from "./praetor-bridge"
//   sendToChat(text)    submit a real user message → the agent / LLM (auto-send)
//   suggest(text)       pre-fill the composer; the user reviews then sends
//   notifyContext({..}) tell the agent what the user just selected / focused
// Build interactive UIs on these (a "让 AI 分析" button, a confirm form that
// posts back, etc). Do NOT stand up a backend endpoint, poll, or use the
// clipboard to get data to the agent — that is exactly what this bridge is for.
export { sendToChat, suggest, notifyContext, praetor };
