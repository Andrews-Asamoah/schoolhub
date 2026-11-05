import { clearPrivateSessionPreferences } from "@/lib/private-session";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useSession } from "@/lib/auth-client";
import { queryClient } from "@/lib/query-client";

function subscribe(listener: () => void) {
  window.addEventListener("schoolhub-role-change", listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("schoolhub-role-change", listener);
    window.removeEventListener("storage", listener);
  };
}
const roleSnapshot = () => window.localStorage.getItem("schoolhub-active-role") ?? "";

/** Never mount a new principal/role against the previous context's private cache. */
export function PrivateContextBoundary({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const role = useSyncExternalStore(subscribe, roleSnapshot, () => "");
  const identity = JSON.stringify([session?.user.id ?? null, session?.session.activeOrganizationId ?? null, role]);
  const previousUser = useRef(session?.user.id);
  const [ready, setReady] = useState<string | null>(null);
  useEffect(() => {
    if (isPending) return;
    if (previousUser.current && previousUser.current !== session?.user.id) {
      clearPrivateSessionPreferences();
      window.dispatchEvent(new Event("schoolhub-role-change"));
    }
    previousUser.current = session?.user.id;
    let active = true;
    void queryClient.cancelQueries().then(() => {
      if (!active) return;
      // clear destroys old query objects, preventing late responses from being reused.
      queryClient.clear();
      if (active) setReady(identity);
    });
    return () => { active = false; };
  }, [identity, isPending]);
  if (isPending || ready !== identity) {
    return <p role="status" className="p-6 text-sm text-muted-foreground">Loading your workspace…</p>;
  }
  return <div key={identity} className="contents">{children}</div>;
}
