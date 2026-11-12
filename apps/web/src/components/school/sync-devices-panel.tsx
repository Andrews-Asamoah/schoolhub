import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { revokeSyncDeviceSchema, type SyncDevicePage, type SyncDeviceSummary } from "@schoolhub/shared";
import { apiFetch, errorText, getClientSubdomain } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { useSchoolRole } from "./school-role-switcher";
import { hasPendingPrivateDrafts } from "@/lib/private-session";
import { hasUnsavedMarks } from "@/hooks/use-mark-draft";

const button = "rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-50";
export function SyncDevicesPanel({ scope = "mine" }: { scope?: "mine" | "school" }) {
  const { data: session, refetch } = useSession();
  const { activeRole } = useSchoolRole();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SyncDeviceSummary | null>(null);
  const [reason, setReason] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const client = useQueryClient();
  const permitted = scope === "mine" || ["owner", "admin"].includes(activeRole ?? "");
  const query = useQuery({
    queryKey: ["sync-devices", session?.user.id, getClientSubdomain(), scope, page],
    queryFn: () => apiFetch<SyncDevicePage>(`/sync/devices?scope=${scope}&page=${page}&limit=10`),
    enabled: Boolean(session?.user) && permitted,
    retry: false,
  });
  const revoke = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => apiFetch(`/sync/devices/${encodeURIComponent(id)}/revoke`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSuccess: async () => {
      const current = selected?.current;
      setSelected(null); setReason("");
      await client.invalidateQueries({ queryKey: ["sync-devices"] });
      if (current) await refetch();
    },
  });
  if (!permitted) return null;
  function submit(event: FormEvent) {
    event.preventDefault();
    const result = revokeSyncDeviceSchema.safeParse({ reason });
    if (!result.success) { setValidation("Enter a reason between 3 and 500 characters."); return; }
    try {
      if (selected?.current && import.meta.env.VITE_TARGET === "desktop" && (hasUnsavedMarks() || hasPendingPrivateDrafts())) {
        setValidation("Save or discard pending assessment marks before revoking this installation."); return;
      }
    } catch { setValidation("Pending work could not be checked. Save your work before revoking this installation."); return; }
    setValidation(null);
    if (selected) revoke.mutate({ id: selected.id, reason: result.data.reason });
  }
  return <section className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-5" aria-label={scope === "school" ? "School desktop devices" : "My desktop devices"}>
    <div>
      <h2 className="font-semibold">{scope === "school" ? "School desktop devices" : "My desktop devices"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">Revoke a lost or shared installation to end its registered sessions. Revocation takes effect when it connects; it does not erase files on an offline computer.</p>
    </div>
    {query.isPending && <p role="status" className="text-sm">Loading devices…</p>}
    {query.error && <p role="alert" className="text-sm text-destructive">{errorText(query.error)} <button type="button" className={button} onClick={() => void query.refetch()}>Retry</button></p>}
    {query.data && <>
      {!query.data.items.length && <p className="text-sm text-muted-foreground">No registered desktop installations.</p>}
      <ul className="divide-y divide-border">
        {query.data.items.map((device) => <li key={device.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div>
            <p className="text-sm font-medium">{device.name}{device.current ? " · This session" : ""}</p>
            <p className="text-xs text-muted-foreground">{scope === "school" ? `${device.owner.name} · ` : ""}{device.platform} · v{device.clientVersion} · Last registered {new Date(device.lastSeenAt).toLocaleString()}</p>
            {device.revokedAt && <p className="text-xs text-destructive">Revoked {new Date(device.revokedAt).toLocaleString()}</p>}
          </div>
          {!device.revokedAt && <button type="button" className={button} disabled={revoke.isPending} onClick={() => { setSelected(device); setReason(""); setValidation(null); revoke.reset(); }}>Revoke</button>}
        </li>)}
      </ul>
      {query.data.total > 10 && <nav aria-label="Device pages" className="flex items-center gap-3 text-sm">
        <button type="button" className={button} disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {page} of {Math.ceil(query.data.total / 10)}</span>
        <button type="button" className={button} disabled={page * 10 >= query.data.total} onClick={() => setPage(page + 1)}>Next</button>
      </nav>}
    </>}
    {selected && <form onSubmit={submit} className="space-y-3 rounded-xl border border-border p-4">
      <p className="text-sm font-medium">Revoke {selected.name}?</p>
      <p className="text-sm text-muted-foreground">Its registered sign-ins will stop working. This installation identity cannot be registered again.{selected.current ? " You will need to sign in again." : ""}</p>
      <label className="block text-sm">Reason
        <input autoFocus required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2" />
      </label>
      {(validation || revoke.error) && <p role="alert" className="text-sm text-destructive">{validation ?? errorText(revoke.error)}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={revoke.isPending} className="rounded-lg bg-destructive px-3 py-2 text-sm text-destructive-foreground disabled:opacity-50">{revoke.isPending ? "Revoking…" : "Revoke installation"}</button>
        <button type="button" disabled={revoke.isPending} className={button} onClick={() => setSelected(null)}>Cancel</button>
      </div>
    </form>}
  </section>;
}
