// The app's OWN auth state for its UI: the platform half from
// @praetor/lite-app-runtime (who is signed in to the platform and admitted to
// this app) plus the business half from this app's /api/auth/me (is that
// person a member here, with which role). The UI only RENDERS these states;
// every decision is made again on the server for each request.
import { useEffect, useRef, useState } from "react";
import { apiPath, getAuthState, login, logout, type PraetorAuthState } from "@praetor/lite-app-runtime";

export type MembershipState =
  | { kind: "loading" }
  /** Legacy runtime / older platform: managed identity is not available here. */
  | { kind: "unsupported" }
  | { kind: "unauthenticated" }
  /** Signed in to the platform but this account may not open this app. Do not loop to login. */
  | { kind: "platform_forbidden" }
  | { kind: "registration_pending" }
  | { kind: "unavailable"; reason?: string }
  /** Signed in and admitted by the platform, but not a member of this app (business 403). */
  | { kind: "not_member"; subject: string }
  /** Accepted an invitation; an app admin still has to confirm. */
  | { kind: "membership_pending"; subject: string; role: string }
  | { kind: "member"; subject: string; role: string; name?: string | null };

export function useAppMembership(): { state: MembershipState; signIn: () => void; signOut: () => Promise<void>; refresh: () => void } {
  const [state, setState] = useState<MembershipState>({ kind: "loading" });
  const [tick, setTick] = useState(0);
  const requestGeneration = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const generation = ++requestGeneration.current;
    const stale = () => cancelled || generation !== requestGeneration.current;
    (async () => {
      const platform: PraetorAuthState = await getAuthState();
      if (stale()) return;
      if (platform.state !== "authenticated") {
        // The runtime SDK names the field `state`; this hook's union uses `kind`.
        // No cast: if the SDK grows a state this union does not know, tsc says so.
        const { state: kind, ...rest } = platform;
        setState({ kind, ...rest });
        return;
      }
      try {
        const r = await fetch(apiPath("/api/auth/me"), { credentials: "same-origin", cache: "no-store" });
        if (stale()) return;
        if (r.status === 401) { setState({ kind: "unauthenticated" }); return; }
        if (!r.ok) { setState({ kind: "unavailable", reason: `http_${r.status}` }); return; }
        const me = (await r.json()) as { state: string; subject: string; role?: string; name?: string | null };
        if (stale()) return;
        if (me.state === "member") setState({ kind: "member", subject: me.subject, role: me.role ?? "member", name: me.name });
        else if (me.state === "pending") setState({ kind: "membership_pending", subject: me.subject, role: me.role ?? "member" });
        else setState({ kind: "not_member", subject: me.subject });
      } catch {
        if (!stale()) setState({ kind: "unavailable", reason: "network" });
      }
    })();
    return () => { cancelled = true; };
  }, [tick]);

  return {
    state,
    signIn: () => login(),
    signOut: async () => {
      const result = await logout();
      if (result.state !== "unauthenticated") {
        // The caller displays a localized error and retains its caches.
        throw new Error(result.state === "unavailable" ? result.reason ?? "logout_unavailable" : result.state);
      }
      ++requestGeneration.current; // Late membership replies cannot resurrect the old user.
      setState({ kind: "unauthenticated" });
      setTick((t) => t + 1);
    },
    refresh: () => setTick((t) => t + 1),
  };
}
