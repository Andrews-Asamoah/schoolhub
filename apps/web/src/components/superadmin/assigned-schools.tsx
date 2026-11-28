import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { platformSchoolRoleLabels, type PlatformSchoolRole } from "@schoolhub/shared";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm-host";
import { toast } from "@/components/ui/toaster";
import { useLogout } from "@/hooks/use-logout";
import { apiFetch, errorText } from "@/lib/api";
import { SubscriptionBadge } from "./subscription-badge";

interface Assignment {
  id: string;
  name: string;
  subdomain: string;
  role: PlatformSchoolRole;
  subscriptionStatus: string;
  expiresAt: string | null;
  desktopEnabled: boolean;
}

export function AssignedSchools() {
  const { logout, isSigningOut, error } = useLogout();
  const cache = useQueryClient();
  const queryKey = ["platform-staff", "schools"];
  const schools = useQuery({
    queryKey,
    queryFn: () => apiFetch<Assignment[]>("/platform-staff/schools"),
    retry: false,
  });
  const access = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      apiFetch(`/platform-staff/schools/${id}/desktop-access`, {
        method: "PATCH", body: JSON.stringify({ enabled }),
      }),
    onSuccess: async () => { await cache.invalidateQueries({ queryKey }); toast.success("Desktop access updated."); },
    onError: (cause) => toast.error(errorText(cause)),
  });

  async function toggleDesktop(school: Assignment) {
    const enabled = !school.desktopEnabled;
    if (!await confirmAction({
      title: `${enabled ? "Enable" : "Disable"} desktop access for ${school.name}?`,
      description: "The school still needs an active subscription or trial to use the desktop app.",
      confirmLabel: enabled ? "Enable access" : "Disable access",
    })) return;
    access.mutate({ id: school.id, enabled });
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm text-muted-foreground">Platform team</p><h1 className="text-2xl font-bold">Assigned schools</h1></div>
        <Button variant="outline" disabled={isSigningOut} onClick={() => void logout()}>Sign out</Button>
      </header>
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {schools.isPending && <p role="status">Loading assigned schools…</p>}
      {schools.error && <p role="alert" className="text-destructive">{schools.error.message} <Button variant="outline" onClick={() => void schools.refetch()}>Retry</Button></p>}
      {schools.data?.length === 0 && <p className="rounded-xl border border-border bg-card p-5">A SuperAdmin can assign your first school.</p>}
      <ul className="grid gap-4 sm:grid-cols-2">
        {schools.data?.map((school) => (
          <li key={school.id} className="space-y-3 rounded-xl border border-border bg-card p-5">
            <div><h2 className="font-semibold">{school.name}</h2><p className="text-sm text-muted-foreground">{school.subdomain} · {platformSchoolRoleLabels[school.role]}</p></div>
            <SubscriptionBadge status={school.subscriptionStatus} expiresAt={school.expiresAt} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">Desktop access {school.desktopEnabled ? "enabled" : "disabled"}</p>
              {school.role === "DESKTOP_ACCESS" && <Button variant="outline" size="sm" disabled={access.isPending}
                onClick={() => void toggleDesktop(school)}>{school.desktopEnabled ? "Disable" : "Enable"} desktop access</Button>}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
