import { memo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";
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
  const mutation = useScopedMutation(
    (input: Parameters<typeof saveRegister>[0]["request"]) =>
      saveRegister({ request: input }),
  );
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
    try {
      await mutation.mutateAsync(attendanceBatch(date, rows, draft));
      setDraft({});
    } catch {
      /* Keep unsaved intent visible. Never queue or retry a rejected batch. */
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
