import { useState } from "react";
import { ListRow } from "@/components/ListRow";
import { Button } from "@/components/Button";
import { SearchBar } from "@/components/Fields";
import { SelectField } from "@/components/SelectField";
import { TextField } from "@/components/TextField";
import {
  getTeacherExternalPaper,
  getTeacherExternalSummary,
  listTeacherExternalExams,
  saveTeacherExternalResults,
  type ExternalExamSheet,
  type ExternalResultStatus,
} from "@/api/teacher-external-exams";
import { useScopedMutation } from "@/features/shared/mutations";
import { useTeacherQuery } from "./queries";
import { Copy, MutationState, Panel, QueryState, TeacherPage } from "./ui";

const statuses: { value: ExternalResultStatus; label: string }[] = [
  { value: "GRADED", label: "Graded" },
  { value: "ABSENT", label: "Absent" },
  { value: "WITHHELD", label: "Withheld" },
  { value: "CANCELLED", label: "Cancelled" },
];
const grades = Array.from({ length: 9 }, (_, index) => ({
  value: String(index + 1),
  label: String(index + 1),
}));

export default function ExternalExams() {
  const sessions = useTeacherQuery(["external-exams"], (signal) =>
    listTeacherExternalExams({ signal }),
  );
  const [sessionId, setSession] = useState("");
  const [paperId, setPaper] = useState("");
  const [dirty, setDirty] = useState(false);
  const exam =
    sessions.data?.find((item) => item.id === sessionId) ?? sessions.data?.[0];
  const selected =
    exam?.papers.find((item) => item.id === paperId) ?? exam?.papers[0];
  const summary = useTeacherQuery(
    ["external-exams", exam?.id, "summary"],
    (signal) => getTeacherExternalSummary({ signal, params: { id: exam!.id } }),
    !!exam,
  );
  const sheet = useTeacherQuery(
    ["external-exams", selected?.id, "paper"],
    (signal) =>
      getTeacherExternalPaper({ signal, params: { id: selected!.id } }),
    !!selected,
  );

  return (
    <TeacherPage
      title="External examinations"
      back
      query={
        dirty
          ? undefined
          : {
              isRefetching:
                sessions.isRefetching ||
                summary.isRefetching ||
                sheet.isRefetching,
              refetch: () =>
                Promise.all([
                  sessions.refetch(),
                  ...(exam ? [summary.refetch()] : []),
                  ...(selected ? [sheet.refetch()] : []),
                ]),
            }
      }
    >
      <QueryState query={sessions} empty={!exam}>
        {exam ? (
          <>
            <Panel title="BECE register">
              <Copy>
                Staff only · School-entered results, unverified by WAEC.
              </Copy>
              <SelectField
                label="Exam session"
                value={exam.id}
                disabled={dirty}
                options={(sessions.data ?? []).map((item) => ({
                  value: item.id,
                  label: `${item.name} · ${item.class.name}`,
                }))}
                onChange={(id) => {
                  setSession(id);
                  setPaper("");
                }}
              />
              <Copy>
                {exam.status} · {exam.academicYear.name}
              </Copy>
              <SelectField
                label="Subject paper"
                value={selected?.id ?? ""}
                disabled={dirty || !exam.papers.length}
                options={exam.papers.map((item) => ({
                  value: item.id,
                  label: `${item.codeSnapshot} · ${item.nameSnapshot}`,
                }))}
                onChange={setPaper}
              />
            </Panel>
            {selected ? (
              <QueryState query={sheet}>
                {sheet.data ? (
                  <PaperEditor
                    key={selected.id}
                    sheet={sheet.data}
                    onDirty={setDirty}
                  />
                ) : null}
              </QueryState>
            ) : null}
            <Panel title="Results summary">
              <QueryState query={summary}>
                {summary.data ? (
                  <>
                    <Copy>
                      {summary.data.candidateCount} candidates ·{" "}
                      {summary.data.missingIndexNumbers} missing index numbers
                    </Copy>
                    {summary.data.papers.map((item) => (
                      <ListRow
                        key={item.id}
                        title={item.name}
                        subtitle={`${item.recorded}/${item.expected} recorded · ${item.pending} pending\nGrades ${item.grades.map(({ grade, count }) => `${grade}: ${count}`).join(" · ")}\nAbsent ${item.statuses.ABSENT} · Withheld ${item.statuses.WITHHELD} · Cancelled ${item.statuses.CANCELLED}`}
                      />
                    ))}
                  </>
                ) : null}
              </QueryState>
            </Panel>
          </>
        ) : null}
      </QueryState>
    </TeacherPage>
  );
}

type Edit = { status: ExternalResultStatus; grade: string; version: number };
function PaperEditor({
  sheet,
  onDirty,
}: {
  sheet: ExternalExamSheet;
  onDirty: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<Record<string, Edit>>({});
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");
  const mutation = useScopedMutation(saveTeacherExternalResults);
  const entries = Object.entries(draft).map(([candidateId, edit]) => ({
    candidateId,
    status: edit.status,
    grade: edit.status === "GRADED" && edit.grade ? Number(edit.grade) : null,
    expectedVersion: edit.version,
  }));
  const invalid = entries.some(
    (row) => row.status === "GRADED" && row.grade === null,
  );
  const term = search.trim().toLowerCase();
  const rows = sheet.candidates.filter((row) =>
    [row.name, row.admissionNumber, row.indexNumber].some((item) =>
      item?.toLowerCase().includes(term),
    ),
  );

  function save() {
    void mutation
      .mutateAsync({
        request: { paperId: sheet.paper.id, sourceReference: source, entries },
      })
      .then(() => {
        setDraft({});
        setSource("");
        onDirty(false);
      })
      .catch(() => undefined);
  }

  function update(
    row: ExternalExamSheet["candidates"][number],
    status: ExternalResultStatus,
    grade: string,
  ) {
    const next = { ...draft };
    if (row.status === status && String(row.grade ?? "") === grade)
      delete next[row.id];
    else
      next[row.id] = {
        status,
        grade,
        version: draft[row.id]?.version ?? row.version,
      };
    setDraft(next);
    onDirty(Object.keys(next).length > 0);
  }

  const editable = sheet.canEdit && !mutation.isPending;
  return (
    <>
      <Panel title={sheet.paper.name}>
        <SearchBar
          label="Search candidates"
          value={search}
          onChange={setSearch}
        />
        {sheet.canEdit ? (
          <>
            <TextField
              label="Source reference"
              hint="Identify the school-held result statement used for these entries."
              value={source}
              onChangeText={setSource}
              maxLength={200}
              editable={editable}
            />
            <Button
              label={
                entries.length
                  ? `Save ${entries.length} result changes`
                  : "Save result changes"
              }
              onPress={save}
              loading={mutation.isPending}
              disabled={
                !editable ||
                !entries.length ||
                entries.length > 120 ||
                invalid ||
                source.trim().length < 5
              }
            />
            {entries.length ? (
              <Button
                label="Discard result changes"
                variant="secondary"
                disabled={!editable}
                onPress={() => {
                  setDraft({});
                  setSource("");
                  onDirty(false);
                }}
              />
            ) : null}
            {entries.length > 120 ? (
              <Copy alert>Save at most 120 changes at a time.</Copy>
            ) : null}
            {invalid ? (
              <Copy alert>
                Choose a grade from 1 to 9 for each graded result.
              </Copy>
            ) : null}
            <MutationState mutation={mutation} />
          </>
        ) : (
          <Copy>Read-only register.</Copy>
        )}
      </Panel>
      {!rows.length ? <Copy>No matching candidates.</Copy> : null}
      {rows.map((row) => {
        const status = draft[row.id]?.status ?? row.status;
        const grade = draft[row.id]?.grade ?? String(row.grade ?? "");
        return (
          <Panel key={row.id} title={row.name}>
            <Copy>
              {[row.admissionNumber, row.indexNumber]
                .filter(Boolean)
                .join(" · ") || "No identifiers recorded"}
            </Copy>
            {sheet.canEdit ? (
              <>
                <SelectField
                  label="Result status"
                  value={status ?? ""}
                  options={statuses}
                  disabled={!editable}
                  onChange={(value) =>
                    update(
                      row,
                      value as ExternalResultStatus,
                      value === "GRADED" ? grade : "",
                    )
                  }
                />
                {status === "GRADED" ? (
                  <SelectField
                    label="Grade"
                    value={grade}
                    options={grades}
                    disabled={!editable}
                    onChange={(value) => update(row, "GRADED", value)}
                  />
                ) : null}
              </>
            ) : (
              <Copy>
                {statuses.find((option) => option.value === status)?.label ??
                  "Unrecorded"}
                {grade ? ` · Grade ${grade}` : ""}
              </Copy>
            )}
            {row.sourceReference ? (
              <Copy>Source: {row.sourceReference}</Copy>
            ) : null}
          </Panel>
        );
      })}
    </>
  );
}
