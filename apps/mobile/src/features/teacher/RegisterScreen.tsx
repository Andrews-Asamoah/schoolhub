import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { AppState, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import type { AttendanceStatus, Register } from "@/api/teacher";
import {
  getTeaching,
  getRegister,
  getRegisterCalendar,
  getRegisterDates,
  getRegisterGaps,
  saveRegister,
} from "@/api/teacher";
import { useScopedMutation } from "@/features/shared/mutations";
import { useSession } from "@/lib/session";
import {
  enqueueRegister,
  flushRegisterQueue,
  isRetryableRegisterError,
  newIdempotencyKey,
  pendingRegisterCount,
} from "@/lib/register-queue";
import { useTeacherQuery } from "./queries";
import {
  calendarBlock,
  attendanceBatch,
  registerStatus,
  type RegisterDraft,
} from "./register";
import { TeacherPage, QueryState, Panel, Copy } from "./ui";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import { DatePickerField, SearchBar } from "@/components/Fields";
import { ConfirmDialog } from "@/components/Dialogs";
import { spacing } from "@/theme/theme";
export default function TeacherRegister() {
  const params = useLocalSearchParams<{ classId: string }>();
  return <RegisterBody key={params.classId} />;
}
function RegisterBody() {
  const params = useLocalSearchParams<{ classId: string; date?: string }>();
  const [date, setDate] = useState(
    params.date ?? new Date().toISOString().slice(0, 10),
  );
  const [draft, setDraft] = useState<RegisterDraft>({});
  const [search, setSearch] = useState("");
  const [discard, setDiscard] = useState<string | null>(null);
  const teaching = useTeacherQuery(["overview"], (signal) =>
    getTeaching({ signal }),
  );
  const klass = teaching.data?.classes.find((c) => c.id === params.classId);
  const calendar = useTeacherQuery(
    ["calendar", teaching.data?.term?.id],
    (signal) =>
      getRegisterCalendar({
        signal,
        params: { termId: teaching.data!.term!.id },
      }),
    !!teaching.data?.term?.id,
  );
  const query = useTeacherQuery(
    ["register", params.classId, date],
    (signal) =>
      getRegister({
        signal,
        params: { classId: params.classId },
        query: { date },
      }),
    !!klass,
  );
  const dates = useTeacherQuery(
    ["register-dates", params.classId],
    (signal) =>
      getRegisterDates({ signal, params: { classId: params.classId } }),
    !!klass,
  );
  const gaps = useTeacherQuery(
    ["gaps", params.classId],
    (signal) =>
      getRegisterGaps({ signal, params: { classId: params.classId } }),
    !!klass,
  );
  const subdomain = useSession().subdomain;
  // One key per save intent: a retry after an unknown outcome reuses it, so the
  // server applies the batch at most once.
  const keyRef = useRef<string | undefined>(undefined);
  const mutation = useScopedMutation(
    (input: Parameters<typeof saveRegister>[0]["request"]) =>
      saveRegister({ request: input, idempotencyKey: keyRef.current }),
  );
  const [pending, setPending] = useState(0);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [queuedNote, setQueuedNote] = useState(false);
  const refetchRegister = query.refetch;
  /** Sends queued registers; resolves with what to show (never sets state itself). */
  const runSync = useCallback(async () => {
    if (!subdomain) return null;
    const result = await flushRegisterQueue({
      subdomain,
      send: (entry) =>
        saveRegister({ request: entry.batch, idempotencyKey: entry.key }),
    }).catch(() => null);
    const remaining = await pendingRegisterCount(subdomain).catch(() => 0);
    return { result, remaining };
  }, [subdomain]);
  const applySync = useCallback(
    (outcome: Awaited<ReturnType<typeof runSync>>) => {
      if (!outcome) return;
      setPending(outcome.remaining);
      const { result } = outcome;
      if (!result) return;
      if (result.rejected.length)
        setSyncNote(
          `${result.rejected.length} saved register${result.rejected.length === 1 ? " was" : "s were"} rejected by the server (for example a closed day or changed assignment) and removed: ${result.rejected.map((r) => r.date).join(", ")}. Review those dates.`,
        );
      else if (result.synced) setSyncNote(null);
      if (result.synced) void refetchRegister();
    },
    [refetchRegister],
  );
  const syncPending = useCallback(
    () => runSync().then(applySync),
    [runSync, applySync],
  );
  useEffect(() => {
    let active = true;
    const sync = () =>
      void runSync().then((outcome) => {
        if (active) applySync(outcome);
      });
    sync();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [runSync, applySync]);
  const rows = query.data ?? [];
  const dirty = Object.keys(draft).length > 0;
  const block = calendarBlock(
    calendar.isError ? undefined : calendar.data,
    date,
    new Date().toISOString().slice(0, 10),
  );
  const editable =
    !!klass?.isClassTeacher &&
    !block &&
    !query.isError &&
    !query.isPending &&
    !mutation.isPending &&
    !calendar.isRefetching;
  function changeDate(next: string) {
    if (dirty) {
      setDiscard(next);
      return;
    }
    mutation.reset();
    setDate(next);
  }
  const refresh = () => {
    if (dirty || mutation.isPending) return;
    void Promise.all([
      query.refetch(),
      calendar.refetch(),
      gaps.refetch(),
      dates.refetch(),
    ]);
  };
  const visible = rows.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()),
  );
  async function save() {
    if (!editable || !dirty) return;
    const batch = attendanceBatch(date, rows, draft);
    const key = newIdempotencyKey();
    keyRef.current = key;
    setQueuedNote(false);
    try {
      await mutation.mutateAsync(batch);
      setDraft({});
      void syncPending();
    } catch (error) {
      /* A server rejection is never queued or retried: unsaved marks stay visible.
         Only an unknown outcome (offline, timeout, 5xx) is kept for a safe retry. */
      if (subdomain && isRetryableRegisterError(error)) {
        const queued = await enqueueRegister({ key, subdomain, batch }).catch(
          () => false,
        );
        if (queued) {
          mutation.reset();
          setDraft({});
          setQueuedNote(true);
          setPending(await pendingRegisterCount(subdomain).catch(() => 0));
        }
      }
    }
  }
  return (
    <TeacherPage title="Class register" back scroll={false}>
      <QueryState query={teaching} empty={!klass}>
        <QueryState query={query} empty={!rows.length}>
          <FlashList
            data={visible}
            keyExtractor={(r) => r.studentId}
            extraData={{ draft, editable }}
            refreshing={query.isRefetching}
            onRefresh={refresh}
            ListHeaderComponent={
              <View style={{ gap: spacing.md }}>
                <Panel title={klass?.name ?? "Register"}>
                  <DatePickerField
                    label="Register date"
                    value={date}
                    onChange={changeDate}
                    disabled={mutation.isPending}
                  />
                  {dirty ? (
                    <Copy alert>
                      {Object.keys(draft).length} unsaved marks. Stay online and
                      save before changing dates.
                    </Copy>
                  ) : null}
                  {!klass?.isClassTeacher ? (
                    <Copy alert>
                      View only: the assigned class teacher marks this register.
                    </Copy>
                  ) : null}
                  <QueryState query={calendar}>
                    {block ? <Copy alert>{block}</Copy> : null}
                  </QueryState>
                  {mutation.isError ? (
                    <Copy alert>
                      Register not saved. The server may have rejected a
                      closure, approved exclusion or changed assignment. Unsaved
                      marks remain here; review or discard them and refresh
                      before retrying.
                    </Copy>
                  ) : null}
                  {mutation.isSuccess ? (
                    <Copy alert>
                      Register saved and confirmed by the server.
                    </Copy>
                  ) : null}
                  {queuedNote ? (
                    <Copy alert>
                      You appear to be offline. The register is saved on this
                      device and will sync automatically when you reopen the app
                      with a connection.
                    </Copy>
                  ) : null}
                  {pending > 0 ? (
                    <>
                      <Copy alert>
                        {pending} register{pending === 1 ? "" : "s"} waiting to
                        sync. Server-confirmed marks may be out of date until it
                        finishes.
                      </Copy>
                      <Button
                        label="Sync now"
                        variant="secondary"
                        disabled={mutation.isPending}
                        onPress={() => {
                          void syncPending();
                        }}
                      />
                    </>
                  ) : null}
                  {syncNote ? <Copy alert>{syncNote}</Copy> : null}
                  <Copy>
                    {
                      rows.filter((r) => registerStatus(r, draft) === "PRESENT")
                        .length
                    }{" "}
                    present ·{" "}
                    {
                      rows.filter((r) => registerStatus(r, draft) === "ABSENT")
                        .length
                    }{" "}
                    absent ·{" "}
                    {
                      rows.filter((r) => registerStatus(r, draft) === "LATE")
                        .length
                    }{" "}
                    late ·{" "}
                    {rows.filter((r) => !registerStatus(r, draft)).length}{" "}
                    unmarked
                  </Copy>
                  <Button
                    label="Mark all present"
                    disabled={!editable}
                    onPress={() => {
                      mutation.reset();
                      setDraft(
                        Object.fromEntries(
                          rows.map((r) => [r.studentId, "PRESENT"]),
                        ),
                      );
                    }}
                  />
                  <Button
                    label="Save register"
                    disabled={!editable || !dirty}
                    loading={mutation.isPending}
                    onPress={() => {
                      void save();
                    }}
                  />
                  {dirty ? (
                    <Button
                      label="Discard unsaved marks"
                      variant="ghost"
                      disabled={mutation.isPending}
                      onPress={() => setDiscard(date)}
                    />
                  ) : null}
                </Panel>
                <SearchBar
                  label="Search register"
                  value={search}
                  onChange={setSearch}
                />
              </View>
            }
            renderItem={({ item }) => (
              <RegisterRow
                row={item}
                status={registerStatus(item, draft)}
                disabled={!editable}
                onMark={(status) => {
                  mutation.reset();
                  setDraft((prev) => ({ ...prev, [item.studentId]: status }));
                }}
              />
            )}
            ListEmptyComponent={<Copy>No pupils match this search.</Copy>}
            ListFooterComponent={
              <View style={{ gap: spacing.md, paddingVertical: spacing.lg }}>
                <Panel title="Register gaps">
                  <QueryState query={gaps} empty={!gaps.data?.days.length}>
                    {gaps.data?.days
                      .slice(-15)
                      .reverse()
                      .map((d) => (
                        <Button
                          key={d.date}
                          label={`${d.date}: ${d.missing} unmarked${d.historical ? " (historical)" : ""}`}
                          variant="ghost"
                          disabled={mutation.isPending}
                          onPress={() => changeDate(d.date)}
                        />
                      ))}
                  </QueryState>
                </Panel>
                <Panel title="Recorded dates">
                  <QueryState query={dates} empty={!dates.data?.length}>
                    {dates.data
                      ?.slice(-15)
                      .reverse()
                      .map((d) => (
                        <Button
                          key={d}
                          label={d}
                          variant="ghost"
                          disabled={mutation.isPending}
                          onPress={() => changeDate(d)}
                        />
                      ))}
                  </QueryState>
                </Panel>
              </View>
            }
          />
        </QueryState>
      </QueryState>
      <ConfirmDialog
        visible={discard !== null}
        title="Discard unsaved marks?"
        message="Only server-confirmed marks will remain."
        onClose={() => setDiscard(null)}
        onConfirm={() => {
          if (discard) {
            setDraft({});
            setDate(discard);
            setDiscard(null);
            mutation.reset();
            refresh();
          }
        }}
      />
    </TeacherPage>
  );
}
const RegisterRow = memo(function RegisterRow({
  row,
  status,
  disabled,
  onMark,
}: {
  row: Register[number];
  status: AttendanceStatus | null;
  disabled: boolean;
  onMark: (status: AttendanceStatus) => void;
}) {
  return (
    <View style={{ paddingVertical: spacing.md }}>
      <Panel title={row.name}>
        <Copy>Current status: {status ?? "UNMARKED"}</Copy>
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
        >
          {(["PRESENT", "ABSENT", "LATE"] as const).map((s) => (
            <Button
              key={s}
              label={`${row.name}: ${s}`}
              block={false}
              variant={status === s ? "primary" : "secondary"}
              disabled={disabled}
              onPress={() => onMark(s)}
            />
          ))}
        </View>
        <SelectField
          label={`Other status for ${row.name}`}
          value={status ?? ""}
          options={["EXCUSED", "SICK", "PERMISSION"].map((s) => ({
            value: s,
            label: s,
          }))}
          disabled={disabled}
          onChange={(value) => onMark(value as AttendanceStatus)}
        />
      </Panel>
    </View>
  );
});
