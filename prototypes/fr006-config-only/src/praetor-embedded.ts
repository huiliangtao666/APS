// Detects whether this page is rendered inside Praetor's Portal / Workbench
// iframe shell. The host appends `?praetorEmbedded=1` to every iframe URL
// (see web-ui/src/chat/utils.ts.withEmbeddedFlag).
//
// Use it in shared layout components to hide your in-app sidebar when the
// outer host already shows the menu:
//
//   import { usePraetorEmbedded } from "./praetor-embedded";
//   function Sidebar({ children }) {
//     if (usePraetorEmbedded()) return null;
//     return <aside>{children}</aside>;
//   }
import { useEffect, useState } from "react";

export const PRAETOR_EMBEDDED_PARAM = "praetorEmbedded" as const;

export function usePraetorEmbedded(): boolean {
  const [embedded, setEmbedded] = useState(isPraetorEmbeddedSync);
  useEffect(() => { setEmbedded(isPraetorEmbeddedSync()); }, []);
  return embedded;
}

/** Sync variant. Returns false outside the browser. */
export function isPraetorEmbeddedSync(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get(PRAETOR_EMBEDDED_PARAM) === "1";
}
