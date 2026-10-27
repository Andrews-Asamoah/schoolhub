import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, Eye, EyeOff, KeyRound, Laptop, LoaderCircle, LogOut, Mail, ShieldCheck, Smartphone, Trash2, UserCircle, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { PASSWORD_MIN_LENGTH, changePasswordSchema } from "@schoolhub/shared";
import { ApiError, apiFetch } from "@/lib/api";
import { authClient, useSession } from "@/lib/auth-client";
import { formatDateTime } from "@/lib/subscription";
import { cn } from "@/lib/utils";
import { TwoFactorPanel } from "@/components/auth/two-factor-panel";
import { PageHeader } from "@/components/superadmin/page-header";
import { ErrorPanel, LoadingPanel } from "@/components/superadmin/state-panels";

export const Route = createFileRoute("/admin/profile")({
  component: AccountSecurityPage,
});

const RULES = [
  { label: `${PASSWORD_MIN_LENGTH}+ characters`, test: (v: string) => v.length >= PASSWORD_MIN_LENGTH },
  { label: "Lowercase letter", test: (v: string) => /[a-z]/.test(v) },
  { label: "Uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { label: "Number", test: (v: string) => /[0-9]/.test(v) },
];

function describeDevice(userAgent: string | null | undefined) {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "unknown device";
  return { label: `${browser} on ${os}`, mobile: /Android|iPhone|iPad|Mobile/.test(ua) };
}

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-6 py-4">
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const results = useMemo(() => RULES.map((rule) => ({ ...rule, ok: rule.test(next) })), [next]);

  const mutation = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      apiFetch("/account/change-password", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: async () => {
      setCurrent(""); setNext(""); setConfirm(""); setError(null);
      await authClient.revokeOtherSessions();
      await queryClient.invalidateQueries({ queryKey: ["superadmin", "sessions"] });
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : "We couldn’t update your password. Try again."),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const parsed = changePasswordSchema.safeParse({ currentPassword: current, newPassword: next });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check your password and try again.");
    if (next !== confirm) return setError("The two new passwords do not match.");
    mutation.mutate(parsed.data);
  }

  const field = "w-full rounded-xl border border-input bg-card px-3.5 py-2.5 pr-10 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";
  const inputs: [string, string, string, (v: string) => void, string][] = [
    ["current", "Current password", current, setCurrent, "current-password"],
    ["new", "New password", next, setNext, "new-password"],
    ["confirm", "Confirm new password", confirm, setConfirm, "new-password"],
  ];

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {inputs.map(([id, label, value, set, autoComplete]) => (
        <div key={id}>
          <label htmlFor={`pw-${id}`} className="text-xs font-semibold text-muted-foreground">{label}</label>
          <div className="relative mt-1.5">
            <input id={`pw-${id}`} type={show ? "text" : "password"} value={value} onChange={(event) => set(event.target.value)} autoComplete={autoComplete} className={field} />
            {id === "new" && (
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide passwords" : "Show passwords"} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            )}
          </div>
        </div>
      ))}
      <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Password requirements">
        {results.map((rule) => (
          <li key={rule.label} className={cn("inline-flex items-center gap-1 text-xs", rule.ok ? "text-success" : "text-muted-foreground")}>
            {rule.ok ? <Check className="size-3.5" /> : <X className="size-3.5" />} {rule.label}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="flex items-start gap-2 text-xs font-medium text-destructive"><CircleAlert className="mt-0.5 size-3.5 shrink-0" />{error}</p>}
      {mutation.isSuccess && <p role="status" className="flex items-center gap-2 text-xs font-medium text-success"><Check className="size-3.5" />Password updated. Your other devices were signed out.</p>}
      <button type="submit" disabled={mutation.isPending} className="superadmin-button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60">
        {mutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Update password
      </button>
    </form>
  );
}

function SessionsCard({ currentToken }: { currentToken?: string }) {
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: ["superadmin", "sessions"],
    queryFn: async () => {
      const result = await authClient.listSessions();
      if (result.error) throw new Error(result.error.message ?? "Could not load sessions");
      return result.data ?? [];
    },
    retry: false,
  });
  const revoke = useMutation({
    mutationFn: async (token: string) => { await authClient.revokeSession({ token }); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["superadmin", "sessions"] }),
  });
  const revokeOthers = useMutation({
    mutationFn: async () => { await authClient.revokeOtherSessions(); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["superadmin", "sessions"] }),
  });
  const others = (sessions.data ?? []).filter((item) => item.token !== currentToken);

  return (
    <Card title="Active sessions" description="Devices currently signed in to your platform account. Sessions end automatically after 8 hours.">
      {sessions.isPending ? <LoadingPanel label="Loading sessions…" /> : sessions.error ? (
        <ErrorPanel message={sessions.error.message} onRetry={() => void sessions.refetch()} />
      ) : (
        <>
          <ul className="divide-y divide-border">
            {sessions.data.map((item) => {
              const device = describeDevice(item.userAgent);
              const isCurrent = item.token === currentToken;
              const Icon = device.mobile ? Smartphone : Laptop;
              return (
                <li key={item.id} className="flex items-center gap-4 py-3.5 first:pt-0 last:pb-0">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Icon className="size-5" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-semibold text-foreground">
                      {device.label}
                      {isCurrent && <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success">This device</span>}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.ipAddress ?? "Unknown IP"} · signed in {formatDateTime(String(item.createdAt))}</p>
                  </div>
                  {!isCurrent && (
                    <button type="button" disabled={revoke.isPending} onClick={() => revoke.mutate(item.token)} className="superadmin-button-secondary inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold">
                      <LogOut className="size-3.5" /> Sign out
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {others.length > 0 && (
            <button type="button" disabled={revokeOthers.isPending} onClick={() => revokeOthers.mutate()} className="superadmin-button-danger mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold">
              <LogOut className="size-4" /> Sign out all other devices
            </button>
          )}
        </>
      )}
    </Card>
  );
}


function TrustedDevicesCard() {
  const queryClient = useQueryClient();
  const devices = useQuery({
    queryKey: ["superadmin", "trusted-devices"],
    queryFn: () => apiFetch<{ data: { id: string; createdAt: string; expiresAt: string }[] }>(
      "/account/security/trusted-devices",
      { method: "GET" },
    ),
    retry: false,
  });
  const revokeOne = useMutation({
    mutationFn: (id: string) => apiFetch(
      `/account/security/trusted-devices/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["superadmin", "trusted-devices"] }),
  });
  const revokeAll = useMutation({
    mutationFn: () => apiFetch<{ success: boolean; revoked: number }>(
      "/account/security/trusted-devices/revoke-all",
      { method: "DELETE" },
    ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["superadmin", "trusted-devices"] }),
  });
  const rows = devices.data?.data ?? [];

  return (
    <Card title="Trusted devices" description="Browsers you explicitly trusted after a successful 2FA check. Trust expires after 30 days and can be revoked here.">
      {devices.isPending ? <LoadingPanel label="Loading trusted devices…" /> : devices.error ? (
        <ErrorPanel message={devices.error.message} onRetry={() => void devices.refetch()} />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
          <ShieldCheck className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold text-foreground">No trusted devices</p>
          <p className="mt-1 text-xs text-muted-foreground">At your next sign-in, select “Trust this device for 30 days” on a private device you control.</p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {rows.map((device) => (
              <li key={device.id} className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"><Laptop className="size-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">Trusted browser</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Last confirmed {formatDateTime(device.createdAt)} · expires {formatDateTime(device.expiresAt)}</p>
                </div>
                <button
                  type="button"
                  disabled={revokeOne.isPending || revokeAll.isPending}
                  onClick={() => revokeOne.mutate(device.id)}
                  className="superadmin-button-secondary inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                >
                  <Trash2 className="size-3.5" /> Revoke
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            disabled={revokeAll.isPending || revokeOne.isPending}
            onClick={() => revokeAll.mutate()}
            className="superadmin-button-danger mt-5 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
          >
            <LogOut className="size-4" /> Revoke all trusted devices
          </button>
        </>
      )}
      {(revokeOne.error || revokeAll.error) && (
        <p role="alert" className="mt-3 text-xs font-medium text-destructive">
          {(revokeOne.error ?? revokeAll.error)?.message ?? "Could not revoke the trusted device."}
        </p>
      )}
    </Card>
  );
}

function AccountSecurityPage() {
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader eyebrow="Personal" title="Account & security" description="Your platform administrator account, password and signed-in devices." />

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-4 bg-brand p-6 text-brand-foreground sm:p-8">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-foreground/10 ring-1 ring-brand-foreground/20"><UserCircle className="size-8" /></span>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold">{user?.name ?? "Super Admin"}</h2>
            <p className="mt-1 text-sm text-brand-accent">SchoolHub platform administrator</p>
          </div>
        </div>
        <dl className="grid divide-y divide-border sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <div className="flex items-center gap-4 px-6 py-5">
            <Mail className="size-4 text-muted-foreground" />
            <div className="min-w-0"><dt className="text-xs font-medium text-muted-foreground">Email address</dt><dd className="mt-1 truncate text-sm font-semibold text-foreground">{user?.email ?? "—"}</dd></div>
          </div>
          <div className="flex items-center gap-4 px-6 py-5">
            <ShieldCheck className="size-4 text-muted-foreground" />
            <div><dt className="text-xs font-medium text-muted-foreground">Platform role</dt><dd className="mt-1 text-sm font-semibold text-foreground">{user?.role ?? "—"}</dd></div>
          </div>
        </dl>
      </section>

      <Card title="Change password" description="Changing your password signs out every other device.">
        <PasswordForm />
      </Card>

      <SessionsCard currentToken={session?.session?.token} />

      <TrustedDevicesCard />

      <Card title="Two-factor authentication" description="Required for platform administrators. New or untrusted devices need your password and an authenticator code; trusted devices can skip routine codes for up to 30 days.">
        <TwoFactorPanel required />
      </Card>
    </div>
  );
}
