import { SchoolSmsAccountPanel } from "@/components/school/school-sms-account-panel";
import { authClient, useSession } from "@/lib/auth-client";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import { useSchoolOrganization } from "@/components/school/school-organization";
import { apiFetch } from "@/lib/api";

type Preferences = { emailEnabled: boolean; smsEnabled: boolean };
type Settings = Preferences & {
  smsConnectionId?: string | null;
  emailDailyLimit: number;
  smsDailyLimit: number;
  providers?: { resend: boolean; hubtel: boolean };
};
type Delivery = {
  id: string;
  channel: string;
  status: string;
  attempts: number;
  reason: string | null;
  createdAt: string;
};
type History = {
  items: Delivery[];
  total: number;
  page: number;
  limit: number;
};
const inputStyle =
  "rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground";
const buttonStyle =
  "rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50";
const panelStyle =
  "space-y-3 rounded-2xl border border-border bg-card p-4 text-foreground sm:p-5";

function ChannelForm({
  value,
  school,
  pending,
  onSave,
}: {
  value: Preferences | Settings;
  school?: boolean;
  pending: boolean;
  onSave: (data: Settings) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      emailEnabled: form.has("email"),
      smsEnabled: form.has("sms"),
      emailDailyLimit: Number(form.get("emailDailyLimit") ?? 0),
      smsDailyLimit: Number(form.get("smsDailyLimit") ?? 0),
    });
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="email"
            defaultChecked={value.emailEnabled}
          />
          {school ? "Enable school email" : "Email me school alerts"}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="sms" defaultChecked={value.smsEnabled} disabled={!!school && "smsConnectionId" in value && !value.smsConnectionId} />
          {school ? "Enable school SMS" : "Text me school alerts"}
        </label>
      </div>
      {school && "emailDailyLimit" in value && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs">
            Daily email limit (UTC)
            <input
              className={inputStyle}
              name="emailDailyLimit"
              type="number"
              min="0"
              max="100000"
              required
              defaultValue={value.emailDailyLimit}
            />
          </label>
          <label className="grid gap-1 text-xs">
            Daily SMS limit (UTC)
            <input
              className={inputStyle}
              name="smsDailyLimit"
              type="number"
              min="0"
              max="10000"
              required
              defaultValue={value.smsDailyLimit}
            />
          </label>
        </div>
      )}
      <button className={buttonStyle} disabled={pending}>
        {pending
          ? "Saving…"
          : school
            ? "Save school delivery settings"
            : "Save my delivery preferences"}
      </button>
    </form>
  );
}

export function NotificationDeliveryWorkspace() {
  const { activeRole } = useSchoolRole();
  const session = useSession();
  const { activeOrganization } = useSchoolOrganization(false);
  const admin = activeRole === "owner" || activeRole === "admin";
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [retryId, setRetryId] = useState("");
  const [reason, setReason] = useState("");
  const key = ["notification-delivery", activeOrganization?.id, activeRole];
  const preferences = useQuery({
    queryKey: [...key, "preferences"],
    queryFn: () => apiFetch<Preferences>("/notifications/delivery/preferences"),
    retry: false,
  });
  const settings = useQuery({
    queryKey: [...key, "settings"],
    queryFn: () => apiFetch<Settings>("/notifications/delivery/settings"),
    enabled: admin,
    retry: false,
  });
  const history = useQuery({
    queryKey: [...key, "history", page],
    queryFn: () =>
      apiFetch<History>(
        `/notifications/delivery/${admin ? "school-history" : "history"}?page=${page}`,
      ),
    retry: false,
    refetchInterval: 30000,
  });
  const verifyEmail = useMutation({
    mutationFn: async () => {
      const email = session.data?.user.email;
      if (!email) throw new Error("Sign in to verify your email.");
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: window.location.href,
      });
      if (result.error)
        throw new Error(
          result.error.message ?? "Unable to send verification email.",
        );
    },
  });
  const invalidate = () =>
    client.invalidateQueries({ queryKey: ["notification-delivery"] });
  const savePreferences = useMutation({
    mutationFn: (value: Settings) =>
      apiFetch("/notifications/delivery/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          emailEnabled: value.emailEnabled,
          smsEnabled: value.smsEnabled,
        }),
      }),
    onSuccess: invalidate,
  });
  const saveSettings = useMutation({
    mutationFn: (value: Settings) =>
      apiFetch("/notifications/delivery/settings", {
        method: "PATCH",
        body: JSON.stringify(value),
      }),
    onSuccess: invalidate,
  });
  const retry = useMutation({
    mutationFn: () =>
      apiFetch(`/notifications/delivery/${retryId}/retry`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      }),
    onSuccess: async () => {
      setRetryId("");
      setReason("");
      await invalidate();
    },
  });
  const error =
    preferences.error ||
    (admin && settings.error) ||
    history.error ||
    savePreferences.error ||
    saveSettings.error ||
    retry.error ||
    verifyEmail.error;
  return (
    <div className="space-y-4">
      <section className={panelStyle}>
        <h2 className="text-sm font-semibold">Email & SMS preferences</h2>
        <p className="text-xs leading-5 text-muted-foreground">
          Choose alerts for this school. Email uses your verified account
          address; SMS uses your Ghana mobile number in your profile. Only a
          general sign-in reminder is sent. You can withdraw consent here at any
          time. School availability and daily limits apply.
        </p>
        {session.data?.user.emailVerified === false && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">
              Verify your account email before email alerts can be delivered.
              Open the link in the verification email, then refresh this page.
            </p>
            <button
              type="button"
              className={buttonStyle}
              disabled={verifyEmail.isPending || verifyEmail.isSuccess}
              onClick={() => verifyEmail.mutate()}
            >
              {verifyEmail.isPending
                ? "Sending verification…"
                : "Verify my email"}
            </button>
            {verifyEmail.isSuccess && (
              <p role="status" className="text-xs">
                Verification email requested. Check your inbox and spam folder.
              </p>
            )}
          </div>
        )}
        {preferences.data ? (
          <ChannelForm
            key={JSON.stringify(preferences.data)}
            value={preferences.data}
            pending={savePreferences.isPending}
            onSave={(value) => savePreferences.mutate(value)}
          />
        ) : (
          <p className="text-xs">Loading preferences…</p>
        )}
        {savePreferences.isSuccess && (
          <p role="status" className="text-xs">
            Delivery preferences saved.
          </p>
        )}
      </section>
      {admin && <SchoolSmsAccountPanel scopeKey={activeOrganization?.id??""} />}
      {admin && (
        <section className={panelStyle}>
          <h2 className="text-sm font-semibold">School delivery controls</h2>
          <p className="text-xs leading-5 text-muted-foreground">
            External delivery starts only when the server is configured, a
            channel is enabled, its limit is above zero, and recipients opt in.
            Limits count send reservations; retries keep their reservation
            within the same UTC day. SMS alerts are one segment.
          </p>
          {settings.data && (
            <>
              <p className="text-xs">
                Resend:{" "}
                {settings.data.providers?.resend ? "Configured" : "Unavailable"}{" "}
                · Hubtel:{" "}
                {settings.data.providers?.hubtel ? "Configured" : "Unavailable"}
              </p>
              <ChannelForm
                key={JSON.stringify(settings.data)}
                value={settings.data}
                school
                pending={saveSettings.isPending}
                onSave={(value) => saveSettings.mutate(value)}
              />
            </>
          )}
          {saveSettings.isSuccess && (
            <p role="status" className="text-xs">
              School delivery settings saved.
            </p>
          )}
        </section>
      )}
      <section className={panelStyle}>
        <h2 className="text-sm font-semibold">
          {admin ? "School delivery history" : "My delivery history"}
        </h2>
        <p className="text-xs leading-5 text-muted-foreground">
          Accepted means the provider received the message. Delivered requires a
          delivery receipt and does not mean it was read. Unknown outcomes
          require investigation; SMS is never automatically resent when its
          outcome is uncertain. Older in-app alerts are not sent retroactively.
        </p>
        {!history.data ? (
          <p className="text-xs">Loading deliveries…</p>
        ) : !history.data.items.length ? (
          <p className="text-sm text-muted-foreground">
            No external deliveries yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {history.data.items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {item.channel} · {item.status.replaceAll("_", " ")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()} ·{" "}
                    {item.attempts} attempt{item.attempts === 1 ? "" : "s"}
                  </p>
                  {item.reason && (
                    <p className="mt-1 break-words text-xs text-muted-foreground">
                      {item.reason.replaceAll("_", " ")}
                    </p>
                  )}
                </div>
                {admin &&
                  item.channel === "EMAIL" &&
                  ["DEAD", "FAILED"].includes(item.status) && (
                    <button
                      className={buttonStyle}
                      onClick={() => {
                        setRetryId(item.id);
                        setReason("");
                      }}
                    >
                      Review email retry
                    </button>
                  )}
              </li>
            ))}
          </ul>
        )}
        {history.data && history.data.total > 25 && (
          <div className="flex items-center gap-3 text-xs">
            <button
              className={buttonStyle}
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Previous deliveries
            </button>
            <span>Page {page}</span>
            <button
              className={buttonStyle}
              disabled={page * 25 >= history.data.total}
              onClick={() => setPage(page + 1)}
            >
              Next deliveries
            </button>
          </div>
        )}
        {retryId && (
          <form
            className="space-y-2 rounded-lg border border-border p-3"
            onSubmit={(event) => {
              event.preventDefault();
              retry.mutate();
            }}
          >
            <p className="text-xs">
              Retry only after correcting the cause. The API permits unaccepted
              failed email within the original 23-hour window and preserves its
              idempotency key.
            </p>
            <label className="grid gap-1 text-xs">
              Retry reason
              <textarea
                className={inputStyle}
                required
                minLength={10}
                maxLength={500}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <div className="flex gap-2">
              <button className={buttonStyle} disabled={retry.isPending}>
                Retry email
              </button>
              <button
                type="button"
                className={buttonStyle}
                onClick={() => setRetryId("")}
              >
                Cancel retry
              </button>
            </div>
          </form>
        )}
      </section>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"
        >
          {error.message}
        </p>
      )}
    </div>
  );
}
