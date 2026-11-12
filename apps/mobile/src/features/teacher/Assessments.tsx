import { useState } from "react";
import { useLocalSearchParams, type Href } from "expo-router";
import {
  getTeaching,
  getTeacherAssessment,
  getTeacherTemplates,
  saveTeacherAssessment,
  type AssessmentSheet,
} from "@/api/teacher";
import { useScopedMutation } from "@/features/shared/mutations";
import { useTeacherQuery } from "./queries";
import {
  TeacherPage,
  QueryState,
  Panel,
  Copy,
  LinkButton,
  MutationState,
} from "./ui";
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
            key={`${classId}:${subjectId}:${q.data.template?.id}`}
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
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const mutation = useScopedMutation(saveTeacherAssessment);
  const dirty = Object.keys(draft).length > 0;
  const save = async () => {
    if (!sheet.template || !sheet.canEdit) return;
    try {
      const entries = Object.entries(draft).map(([key, text]) => {
        const [studentId, componentId, index] = JSON.parse(key) as [
          string,
          string,
          number,
        ];
        const component = sheet.template!.components.find(
          (c) => c.id === componentId,
        )!;
        return {
          studentId,
          componentId,
          occurrenceIndex: index,
          marks: numericMark(text, component.maxMarks),
        };
      });
      setError("");
      await mutation.mutateAsync({
        request: {
          classId: sheet.class.id,
          subjectId: sheet.subject.id,
          templateId: sheet.template.id,
          entries,
        },
      });
      setDraft({});
    } catch {
      setError(
        "Marks were not saved. Use values within each maximum; refresh if the assessment was locked or changed.",
      );
    }
  };
  return (
    <>
      <Panel title={`${sheet.class.name} · ${sheet.subject.name}`}>
        <SelectField
          label="Assessment template"
          value={sheet.template?.id ?? ""}
          options={sheet.templates.map((t) => ({ value: t.id, label: t.name }))}
          disabled={dirty || mutation.isPending}
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
        <MutationState mutation={mutation} />
        <Button
          label="Save marks"
          disabled={!dirty || !sheet.canEdit}
          loading={mutation.isPending}
          onPress={() => {
            void save();
          }}
        />
        <Button
          label="Discard marks"
          variant="ghost"
          disabled={!dirty || mutation.isPending}
          onPress={() => {
            setDraft({});
            setError("");
          }}
        />
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
            </Copy>
            {sheet.template!.components.flatMap((c) =>
              Array.from({ length: c.slots }, (_, i) => {
                const key = JSON.stringify([s.studentId, c.id, i]);
                const value =
                  draft[key] ??
                  String(
                    s.marks.find(
                      (m) => m.componentId === c.id && m.occurrenceIndex === i,
                    )?.marks ?? "",
                  );
                return (
                  <TextField
                    key={key}
                    label={`${s.name}: ${c.name}${c.slots > 1 ? ` ${i + 1}` : ""} / ${c.maxMarks}`}
                    value={value}
                    keyboardType="decimal-pad"
                    editable={sheet.canEdit && !mutation.isPending}
                    onChangeText={(text) =>
                      setDraft((prev) => ({ ...prev, [key]: text }))
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
