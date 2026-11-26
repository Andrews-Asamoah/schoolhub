import { MarksImport } from "./MarksImport";
import { useState } from "react";
import { Alert } from "react-native";
import { useLocalSearchParams, type Href } from "expo-router";
import {
  getTeaching,
  getTeacherAssessment,
  getTeacherTemplates,
  saveTeacherAssessment,
  submitTeacherAssessment,
  requestTeacherMarkCorrection,
  type AssessmentSheet,
} from "@/api/teacher";
import { useScopedMutation } from "@/features/shared/mutations";
import { useTeacherQuery } from "./queries";
import { TeacherPage, QueryState, Panel, Copy, LinkButton } from "./ui";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import { TextField } from "@/components/TextField";
import { numericMark } from "./forms";
export function TeacherAssess() {
  const q = useTeacherQuery(["overview"], (signal) => getTeaching({ signal }));
  const templates = useTeacherQuery(["templates"], (signal) =>
    getTeacherTemplates({ signal }),
  );
  return (
    <TeacherPage
      title="Assess"
      query={{
        isRefetching: q.isRefetching || templates.isRefetching,
        refetch: () => Promise.all([q.refetch(), templates.refetch()]),
      }}
    >
      <LinkButton
        label="Report recommendations"
        href={"/(teacher)/teacher-report-review" as Href}
      />
      <LinkButton
        label="Published report archive"
        href={"/(teacher)/teacher-report-archive" as Href}
      />
      <LinkButton
        label="Internal mock analysis"
        href={"/(teacher)/teacher-mock-analysis" as Href}
      />
      <QueryState
        query={q}
        empty={!q.data?.classes.some((c) => c.subjects.length)}
      >
        <Panel title="Score entry">
          <Copy>
            Choose a subject assigned to you. Scores and totals are calculated
            by the server.
          </Copy>
          <QueryState query={templates} empty={!templates.data?.length}>
            {q.data?.classes.flatMap((c) =>
              c.subjects.map((s) => (
                <LinkButton
                  key={`${c.id}:${s.id}`}
                  label={`${c.name} · ${s.name}`}
                  href={
                    {
                      pathname: "/(teacher)/teacher-score-entry",
                      params: { classId: c.id, subjectId: s.id },
                    } as Href
                  }
                />
              )),
            )}
          </QueryState>
        </Panel>
      </QueryState>
    </TeacherPage>
  );
}
export function TeacherScoreEntry() {
  const { classId = "", subjectId = "" } = useLocalSearchParams<{
    classId: string;
    subjectId: string;
  }>();
  const [templateId, setTemplate] = useState("");
  const q = useTeacherQuery(
    ["assessment", classId, subjectId, templateId],
    (signal) =>
      getTeacherAssessment({
        signal,
        query: { classId, subjectId, templateId: templateId || undefined },
      }),
    !!classId && !!subjectId,
  );
  return (
    <TeacherPage title="Score entry" query={q} back>
      <QueryState query={q}>
        {q.data ? (
          <AssessmentEditor
            key={`${classId}:${subjectId}:${q.data.term.id}:${q.data.template?.id}`}
            sheet={q.data}
            onTemplate={setTemplate}
          />
        ) : null}
      </QueryState>
    </TeacherPage>
  );
}
function AssessmentEditor({
  sheet,
  onTemplate,
}: {
  sheet: AssessmentSheet;
  onTemplate: (id: string) => void;
}) {
  const [draft, setDraft] = useState<
    Record<string, { text: string; expectedMarks: number | null }>
  >({});
  const [excused, setExcused] = useState<string[]>([]);
  const [correcting, setCorrecting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const saveMutation = useScopedMutation(saveTeacherAssessment);
  const submitMutation = useScopedMutation(submitTeacherAssessment);
  const correctionMutation = useScopedMutation(requestTeacherMarkCorrection);
  const pending =
    saveMutation.isPending ||
    submitMutation.isPending ||
    correctionMutation.isPending;
  const dirty = Object.keys(draft).length > 0;
  const unfinished = sheet.students.filter((student) =>
    excused.includes(student.studentId)
      ? student.marks.length > 0
      : !student.complete,
  ).length;
  const ref = {
    classId: sheet.class.id,
    subjectId: sheet.subject.id,
    templateId: sheet.template?.id ?? "",
  };
  function entries() {
    return Object.entries(draft).map(([key, { text, expectedMarks }]) => {
      const [studentId, componentId, occurrenceIndex] = JSON.parse(key) as [
        string,
        string,
        number,
      ];
      const component = sheet.template?.components.find(
        (item) => item.id === componentId,
      );
      if (
        !component ||
        (correcting ? !component.canCorrect : component.canEdit === false)
      )
        throw new Error("You cannot edit one of the selected marks.");
      return {
        studentId,
        componentId,
        occurrenceIndex,
        expectedMarks,
        marks: numericMark(text, component.maxMarks),
      };
    });
  }
  async function save() {
    setError("");
    setNotice("");
    try {
      if (correcting) {
        await correctionMutation.mutateAsync({
          request: { ...ref, reason, items: entries(), applyNow: false },
        });
        setCorrecting(false);
        setReason("");
        setNotice("Correction sent for approval.");
      } else {
        await saveMutation.mutateAsync({
          request: { ...ref, termId: sheet.term.id, entries: entries() },
        });
        setNotice("Marks saved.");
      }
      setDraft({});
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Marks could not be saved.",
      );
    }
  }
  async function submit() {
    setError("");
    setNotice("");
    try {
      await submitMutation.mutateAsync({
        request: { ...ref, excusedStudentIds: excused },
      });
      setExcused([]);
      setNotice("Marks submitted.");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Marks could not be submitted.",
      );
    }
  }
  if (importing && sheet.template && sheet.canEdit) {
    return <MarksImport sheet={sheet} onClose={() => setImporting(false)} />;
  }
  return (
    <>
      <Panel title={`${sheet.class.name} · ${sheet.subject.name}`}>
        <SelectField
          label="Assessment template"
          value={sheet.template?.id ?? ""}
          options={sheet.templates.map((t) => ({ value: t.id, label: t.name }))}
          disabled={dirty || !!excused.length || correcting || pending}
          onChange={onTemplate}
        />
        <Copy>
          {sheet.readOnlyReason ??
            "Blank clears a mark; zero is a recorded score."}
        </Copy>
        {dirty ? (
          <Copy alert>
            Unsaved marks: save or discard before changing templates or
            refreshing.
          </Copy>
        ) : null}
        {error ? <Copy alert>{error}</Copy> : null}
        {notice ? <Copy>{notice}</Copy> : null}
        {sheet.submission ? (
          <Copy>
            Submitted on{" "}
            {new Date(sheet.submission.submittedAt).toLocaleDateString()}
          </Copy>
        ) : null}
        {sheet.pendingCorrection ? (
          <Copy>Correction awaiting approval.</Copy>
        ) : null}
        {correcting ? (
          <TextField
            label="Reason for correction"
            value={reason}
            onChangeText={setReason}
            editable={!pending}
            multiline
          />
        ) : null}
        <Button
          label={correcting ? "Send for approval" : "Save marks"}
          disabled={
            !dirty ||
            pending ||
            (correcting ? reason.trim().length < 10 : !sheet.canEdit)
          }
          loading={saveMutation.isPending || correctionMutation.isPending}
          onPress={() => {
            void save();
          }}
        />
        <Button
          label={correcting ? "Cancel correction" : "Discard marks"}
          variant="ghost"
          disabled={(!dirty && !correcting) || pending}
          onPress={() => {
            setDraft({});
            setCorrecting(false);
            setReason("");
            setError("");
          }}
        />
        {sheet.canEdit && sheet.template && !correcting ? (
          <Button
            label="Import marks spreadsheet"
            variant="secondary"
            disabled={dirty || pending}
            onPress={() => setImporting(true)}
          />
        ) : null}
        {sheet.canRequestCorrection && !correcting ? (
          <Button
            label="Request correction"
            variant="secondary"
            onPress={() => setCorrecting(true)}
          />
        ) : null}
        {sheet.canSubmit && sheet.students.length && !correcting ? (
          <>
            {unfinished ? (
              <Copy>
                {unfinished} pupils still need complete marks or an absence
                selection.
              </Copy>
            ) : null}
            <Button
              label="Submit marks"
              disabled={dirty || unfinished > 0 || pending}
              loading={submitMutation.isPending}
              onPress={() =>
                Alert.alert(
                  "Submit marks?",
                  "This sends the sheet for reporting and locks further mark entry.",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Submit marks", onPress: () => void submit() },
                  ],
                )
              }
            />
          </>
        ) : null}
      </Panel>
      {!sheet.template || !sheet.students.length ? (
        <Copy>No applicable score sheet is available.</Copy>
      ) : (
        sheet.students.map((s) => (
          <Panel key={s.studentId} title={s.name}>
            <Copy>
              {s.percentage == null
                ? "Incomplete"
                : `${s.percentage}% · ${s.grade ?? "No grade"}`}
              {sheet.template?.grades?.find((band) => band.grade === s.grade)
                ?.description
                ? ` · ${sheet.template.grades.find((band) => band.grade === s.grade)?.description}`
                : ""}
            </Copy>
            {s.excused ? <Copy>Absent / excused</Copy> : null}
            {sheet.canSubmit && !correcting ? (
              <Button
                label={
                  excused.includes(s.studentId)
                    ? "Undo absent / excused"
                    : "Mark absent / excused"
                }
                variant="ghost"
                disabled={
                  pending ||
                  dirty ||
                  (s.marks.length > 0 && !excused.includes(s.studentId))
                }
                onPress={() =>
                  setExcused((ids) =>
                    ids.includes(s.studentId)
                      ? ids.filter((id) => id !== s.studentId)
                      : [...ids, s.studentId],
                  )
                }
              />
            ) : null}
            {sheet.canSubmit && s.marks.length ? (
              <Copy>
                Clear and save existing marks before marking this pupil absent.
              </Copy>
            ) : null}
            {sheet.template!.components.flatMap((c) =>
              Array.from({ length: c.slots }, (_, i) => {
                const key = JSON.stringify([s.studentId, c.id, i]);
                const saved =
                  s.marks.find(
                    (mark) =>
                      mark.componentId === c.id && mark.occurrenceIndex === i,
                  )?.marks ?? null;
                const value = draft[key]?.text ?? String(saved ?? "");
                return (
                  <TextField
                    key={key}
                    label={`${s.name}: ${c.name}${c.slots > 1 ? ` ${i + 1}` : ""} / ${c.maxMarks}`}
                    value={value}
                    keyboardType="decimal-pad"
                    editable={
                      !pending &&
                      !excused.includes(s.studentId) &&
                      (correcting
                        ? c.canCorrect === true
                        : sheet.canEdit && c.canEdit !== false)
                    }
                    onChangeText={(text) =>
                      setDraft((prev) => ({
                        ...prev,
                        [key]: {
                          text,
                          expectedMarks: prev[key]
                            ? prev[key].expectedMarks
                            : saved,
                        },
                      }))
                    }
                  />
                );
              }),
            )}
          </Panel>
        ))
      )}
    </>
  );
}
