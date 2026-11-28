import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { registerDesktopDevice } from "./session";
import { version } from "../../../../../desktop/package.json";

export default function DesktopDeviceStatus() {
  const { data: session } = useSession();
  if (!session?.user || session.user.mustChangePassword) return null;
  return <Installation key={session.session.id} />;
}
function Installation() {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  useEffect(() => {
    let active = true;
    setStatus(null); setError(null);
    void registerDesktopDevice().then(() => {
      if (active) { setStatus("Installation registered"); void queryClient.invalidateQueries({ queryKey: ["sync-devices"] }); }
    }).catch((error: unknown) => {
      if (active) setError(typeof error === "string" ? error : error instanceof Error ? error.message : "Could not register this installation.");
    });
    return () => { active = false; };
  }, [attempt, queryClient]);
  return <div className="border-b border-border bg-muted px-4 py-2 text-xs text-foreground">
    <span>SchoolHub Desktop {version} · </span>
    <span role={error ? "alert" : "status"}>{error ?? status ?? "Registering this installation…"}</span>
    {error && <button type="button" className="ml-3 font-semibold text-primary" onClick={() => setAttempt(attempt + 1)}>Retry registration</button>}
    {status && <span className="ml-2 text-muted-foreground">Manage devices in My profile.</span>}
  </div>;
}
