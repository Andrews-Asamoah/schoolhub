import { canUseBrowserStorage, localPreferences } from "@/lib/browser-storage";
import { clearPrivateSessionPreferences } from "@/lib/private-session";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useSession } from "@/lib/auth-client";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useRouter } from "@tanstack/react-router";
import { queryClient, createQueryClient, activateQueryClient } from "@/lib/query-client";
import { expireRequestContext } from "@/lib/request-context";

function subscribe(listener: () => void) {
  window.addEventListener("schoolhub-role-change", listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener("schoolhub-role-change", listener);
    window.removeEventListener("storage", listener);
  };
}
const roleSnapshot = () => localPreferences.getItem("schoolhub-active-role") ?? "";

/** Never mount a new principal/role against the previous context's private cache. */
export function PrivateContextBoundary({ children }: { children: ReactNode }) {
  const { data: session, isPending } = useSession();
  const role = useSyncExternalStore(subscribe, roleSnapshot, () => "");
  const identity = JSON.stringify([session?.user.id ?? null, session?.session.activeOrganizationId ?? null, role]);
  const previousUser = useRef(session?.user.id);
  const router=useRouter();
  const [ready, setReady] = useState<{identity:string;client:QueryClient}|null>(null);
  useEffect(() => {
    if (isPending) return;
    if (previousUser.current && previousUser.current !== session?.user.id) {
      clearPrivateSessionPreferences();
      window.dispatchEvent(new Event("schoolhub-role-change"));
    }
    previousUser.current = session?.user.id;
    let active = true;
    const previousClient=queryClient;
    expireRequestContext();
    void previousClient.cancelQueries().then(() => {
      if (!active) return;
      // clear destroys old query objects, preventing late responses from being reused.
      previousClient.clear();
      const client=createQueryClient();
      activateQueryClient(client);
      router.update({context:{...router.options.context,queryClient:client}});
      setReady({identity,client});
    });
    return () => { active = false; };
  }, [identity, isPending, router]);
  if (isPending || ready?.identity !== identity) {
    return <p role="status" className="p-6 text-sm text-muted-foreground">Loading your workspace…</p>;
  }
  return <QueryClientProvider key={identity} client={ready.client}><div className="contents">{children}</div>{import.meta.env.DEV&&canUseBrowserStorage("localStorage")&&<ReactQueryDevtools initialIsOpen={false}/>}</QueryClientProvider>;
}
