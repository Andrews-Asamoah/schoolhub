import { useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  schoolHubtelConnectionSchema,
  type SchoolHubtelConnectionInput,
} from "@schoolhub/shared";
import { apiFetch } from "@/lib/api";
import { SchoolSmsFields, emptySchoolSms } from "./school-sms-fields";
type SmsStatus = {
  configured: boolean;
  ready: boolean;
  encryptionReady: boolean;
  senderId: string | null;
  clientIdHint: string | null;
  apiBaseUrl: SchoolHubtelConnectionInput["apiBaseUrl"];
  updatedAt: string | null;
};
const button =
  "rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50";
export function SchoolSmsAccountPanel({
  endpoint = "/notifications/delivery/sms-account",
  scopeKey,
}: {
  endpoint?: string;
  scopeKey: string;
}) {
  return (
    <SchoolSmsAccountWorkspace
      key={scopeKey + ":" + endpoint}
      endpoint={endpoint}
      scopeKey={scopeKey}
    />
  );
}
function SchoolSmsAccountWorkspace({
  endpoint = "/notifications/delivery/sms-account",
  scopeKey,
}: {
  endpoint?: string;
  scopeKey: string;
}) {
  const scopedEndpoint =
    endpoint === "/notifications/delivery/sms-account"
      ? endpoint + "?organizationId=" + encodeURIComponent(scopeKey)
      : endpoint;
  const client = useQueryClient(),
    [editing, setEditing] = useState(false),
    [confirmDisconnect, setConfirmDisconnect] = useState(false),
    [draft, setDraft] = useState(emptySchoolSms),
    [notice, setNotice] = useState(""),
    [validation, setValidation] = useState("");
  const query = useQuery({
    queryKey: ["school-sms-account", scopeKey, endpoint],
    queryFn: () => apiFetch<SmsStatus>(scopedEndpoint),
    retry: false,
    enabled: !!scopeKey,
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["school-sms-account"] }),
      client.invalidateQueries({ queryKey: ["notification-delivery"] }),
    ]);
  };
  const save = useMutation({
    gcTime: 0,
    mutationFn: (input: SchoolHubtelConnectionInput) =>
      apiFetch<SmsStatus>(scopedEndpoint, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      setDraft(emptySchoolSms());
      setEditing(false);
      setNotice(
        "School Hubtel account saved. Enable SMS and a daily limit in the school's Notifications settings when ready.",
      );
      save.reset();
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(scopedEndpoint, { method: "DELETE" }),
    onSuccess: async () => {
      setConfirmDisconnect(false);
      setEditing(false);
      setDraft(emptySchoolSms());
      setNotice(
        "School SMS disconnected. Stored keys were erased and SMS was disabled.",
      );
      await refresh();
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation("");
    const parsed = schoolHubtelConnectionSchema.safeParse(draft);
    if (!parsed.success) {
      setValidation(
        parsed.error.issues[0]?.message ?? "Check the Hubtel details.",
      );
      return;
    }
    save.mutate(parsed.data);
  }
  const error = query.error || save.error || remove.error;
  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-4 text-foreground shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">School-funded SMS</h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            Use this school's Hubtel Programmable SMS account and approved
            sender name. Hubtel charges that account's SMS credit. Top up credit
            in Hubtel; SchoolHub's daily limit is a separate sending cap.
          </p>
        </div>
        <a
          href="https://bo.hubtel.com/"
          target="_blank"
          rel="noopener noreferrer"
          className={button}
        >
          Top up in Hubtel
        </a>
      </div>
      {!query.data ? (
        <p className="text-xs text-muted-foreground">Loading SMS account…</p>
      ) : (
        <>
          <div className="rounded-lg border border-border p-3 text-xs leading-6">
            <p>
              {query.data.configured
                ? `Sender: ${query.data.senderId} · Client ID: ${query.data.clientIdHint}`
                : "No school Hubtel account connected."}
            </p>
            <p className="text-muted-foreground">
              {query.data.configured
                ? query.data.ready
                  ? "Credentials stored securely. Hubtel approval and credit availability must be confirmed in Hubtel."
                  : "Stored credentials cannot currently be read. Contact the platform administrator."
                : "Connect the school’s own credentials to send SMS. Platform account keys are not used as a fallback."}
            </p>
          </div>
          {!query.data.encryptionReady && (
            <p className="text-xs text-muted-foreground">
              The platform administrator must configure SMS credential
              encryption before new keys can be saved.
            </p>
          )}
          {!editing ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!query.data.encryptionReady || remove.isPending}
                className={button}
                onClick={() => {
                  setNotice("");
                  setDraft({
                    ...emptySchoolSms(),
                    senderId: query.data?.senderId ?? "",
                    apiBaseUrl:
                      query.data?.apiBaseUrl ?? emptySchoolSms().apiBaseUrl,
                  });
                  setEditing(true);
                }}
              >
                {query.data.configured
                  ? "Replace Hubtel connection"
                  : "Connect Hubtel account"}
              </button>
              {query.data.configured && (
                <button
                  type="button"
                  className={button}
                  onClick={() => setConfirmDisconnect(true)}
                >
                  Disconnect school SMS
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <p className="text-xs leading-5 text-muted-foreground">
                Enter the full Client ID and secret for this school's account.
                Existing secrets are never displayed. Saving disables school SMS
                until it is explicitly enabled again. No test message is sent
                when saving.
              </p>
              <SchoolSmsFields
                value={draft}
                onChange={setDraft}
                disabled={save.isPending}
              />
              <div className="flex gap-2">
                <button className={button} disabled={save.isPending}>
                  {save.isPending ? "Saving…" : "Save Hubtel account"}
                </button>
                <button
                  type="button"
                  className={button}
                  disabled={save.isPending}
                  onClick={() => {
                    setEditing(false);
                    setDraft(emptySchoolSms());
                    save.reset();
                  }}
                >
                  Cancel SMS setup
                </button>
              </div>
            </form>
          )}
        </>
      )}
      {confirmDisconnect && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          <p className="text-xs leading-5">
            Disconnecting erases all stored keys for this school, stops new SMS
            and stops tracking outstanding delivery receipts. Messages already
            in flight may still complete in Hubtel.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Confirm disconnect
            </button>
            <button
              type="button"
              className={button}
              disabled={remove.isPending}
              onClick={() => setConfirmDisconnect(false)}
            >
              Keep SMS connected
            </button>
          </div>
        </div>
      )}
      {notice && (
        <p role="status" className="text-xs leading-5">
          {notice}
        </p>
      )}
      {(error || validation) && (
        <p role="alert" className="text-sm text-destructive">
          {validation || error?.message}
        </p>
      )}
    </section>
  );
}
