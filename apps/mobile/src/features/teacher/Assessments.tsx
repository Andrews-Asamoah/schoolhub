import { MarksImport } from "./MarksImport";
import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
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
import { TeacherPage, QueryState, Panel, Copy } from "./ui";
import {
  BookOpen,
  ChartNoAxesColumn,
  BookOpenCheck,
  ClipboardList,
  Files,
} from "lucide-react-native";
import { SearchBar } from "@/components/Fields";
import { ListRow } from "@/components/ListRow";
import { StatusPill } from "@/components/ModulePrimitives";
import { PortalMenu } from "@/components/PortalMenu";
import { Surface } from "@/components/Surface";
import { EmptyState } from "@/components/States";
import { spacing, useTheme } from "@/theme/theme";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import { TextField } from "@/components/TextField";
import { numericMark } from "./forms";
export function TeacherAssess() {
  const q = useTeacherQuery(["overview"], (signal) => getTeaching({ signal }));
  const templates = useTeacherQuery(["templates"], (signal) =>
    getTeacherTemplates({ signal }),
  );
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const classes =
    q.data?.classes
      .map((c) => ({
        ...c,
        subjects: c.subjects.filter((subject) =>
          `${c.name} ${subject.name}`.toLowerCase().includes(term),
        ),
      }))
      .filter((c) => c.subjects.length) ?? [];
  return (
    <TeacherPage
      title="Assessments"
      subtitle={q.data?.term?.name}
      query={{
        isRefetching: q.isRefetching || templates.isRefetching,
        refetch: () => Promise.all([q.refetch(), templates.refetch()]),
      }}
    >
      <QueryState
        query={q}
        empty={!q.data?.classes.some((c) => c.subjects.length)}
      >
        <QueryState query={templates} empty={!templates.data?.length}>
          <Copy heading>Score entry</Copy>
          <SearchBar
            label="Search classes and subjects"
            value={search}
            onChange={setSearch}
          />
          {classes.length ? (
            classes.map((c) => (
              <Surface key={c.id} style={styles.group}>
                <Copy heading>{c.name}</Copy>
                {c.subjects.map((subject, index) => (
                  <ListRow
                    key={subject.id}
                    title={subject.name}
                    leading={<BookOpen size={18} color={colors.primary} />}
                    hue="orange"
                    chevron
                    divider={index < c.subjects.length - 1}
                    onPress={() =>
                      router.push({
                        pathname: "/(teacher)/teacher-score-entry",
                        params: { classId: c.id, subjectId: subject.id },
                      } as Href)
                    }
                  />
                ))}
              </Surface>
            ))
          ) : (
            <EmptyState
              title="No matches"
              message="Try another class or subject name."
              hue="orange"
            />
          )}
        </QueryState>
      </QueryState>
      <PortalMenu
        title="Reports and analysis"
        hue="violet"
        links={[
          {
            label: "Report recommendations",
            href: "/(teacher)/teacher-report-review",
            icon: ClipboardList,
          },
          {
            label: "Published report archive",
            href: "/(teacher)/teacher-report-archive",
            icon: Files,
          },
          {
            label: "External examinations",
            href: "/(teacher)/teacher-external-exams",
            icon: BookOpenCheck,
          },
          {
            label: "Internal mock analysis",
            href: "/(teacher)/teacher-mock-analysis",
            icon: ChartNoAxesColumn,
          },
        ]}
      />
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
  const [excused, setExcused] = useState<string[]>(() =>
    sheet.students
      .filter((student) => student.excused)
      .map((student) => student.studentId),
  );
  const [pupilSearch, setPupilSearch] = useState("");
  const pupils = sheet.students.filter((pupil) =>
    pupil.name.toLowerCase().includes(pupilSearch.trim().toLowerCase()),
  );
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
  const absenceChanged = sheet.students.some(
    (student) => !!student.excused !== excused.includes(student.studentId),
  );
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
  function markExcused(student: AssessmentSheet["students"][number]) {
    if (excused.includes(student.studentId)) {
      setExcused((ids) => ids.filter((id) => id !== student.studentId));
      return;
    }
    if (!student.marks.length) {
      setExcused((ids) => [...ids, student.studentId]);
      return;
    }
    Alert.alert(
      "Clear recorded marks?",
      `This clears ${student.name}’s existing marks. Submit the sheet to record the pupil as absent or excused.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear marks",
          style: "destructive",
          onPress: () => {
            setError("");
            setNotice("");
            void saveMutation
              .mutateAsync({
                request: {
                  ...ref,
                  termId: sheet.term.id,
                  entries: student.marks.map((mark) => ({
                    studentId: student.studentId,
                    componentId: mark.componentId,
                    occurrenceIndex: mark.occurrenceIndex,
                    expectedMarks: mark.marks,
                    marks: null,
                  })),
                },
              })
              .then(() => {
                setExcused((ids) =>
                  ids.includes(student.studentId)
                    ? ids
                    : [...ids, student.studentId],
                );
                setNotice(
                  "Recorded marks cleared. Submit the sheet to save the absence.",
                );
              })
              .catch(() =>
                setError("Marks could not be cleared. Refresh and try again."),
              );
          },
        },
      ],
    );
  }
  async function submit() {
    setError("");
    setNotice("");
    try {
      await submitMutation.mutateAsync({
        request: { ...ref, excusedStudentIds: excused },
      });
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
        <View style={styles.badges}>
          <StatusPill label={sheet.term.name} hue="violet" />
          <StatusPill
            label={
              sheet.submission
                ? "Submitted"
                : sheet.canEdit
                  ? "Open for entry"
                  : "Read only"
            }
            hue={sheet.canEdit ? "emerald" : "amber"}
          />
        </View>
        <SelectField
          label="Assessment template"
          value={sheet.template?.id ?? ""}
          options={sheet.templates.map((t) => ({ value: t.id, label: t.name }))}
          disabled={dirty || absenceChanged || correcting || pending}
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
        <>
          <SearchBar
            label="Find a pupil"
            value={pupilSearch}
            onChange={setPupilSearch}
          />
          {!pupils.length ? (
            <EmptyState
              title="No pupils match"
              message="Try another name."
              hue="orange"
            />
          ) : null}
          {pupils.map((s) => (
            <Panel key={s.studentId} title={s.name}>
              <View style={styles.badges}>
                <StatusPill
                  label={
                    s.percentage == null ? "Incomplete" : `${s.percentage}%`
                  }
                  hue={s.percentage == null ? "amber" : "emerald"}
                />
                {s.grade ? <StatusPill label={s.grade} hue="violet" /> : null}
              </View>
              {sheet.template?.grades?.find((band) => band.grade === s.grade)
                ?.description ? (
                <Copy>
                  {
                    sheet.template.grades.find((band) => band.grade === s.grade)
                      ?.description
                  }
                </Copy>
              ) : null}
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
                    (!excused.includes(s.studentId) &&
                      s.marks.some(
                        (mark) =>
                          !sheet.template?.components.some(
                            (component) =>
                              component.id === mark.componentId &&
                              component.canEdit !== false,
                          ),
                      ))
                  }
                  onPress={() => markExcused(s)}
                />
              ) : null}
              <View style={styles.fields}>
                {sheet.template!.components.flatMap((c) =>
                  Array.from({ length: c.slots }, (_, i) => {
                    const key = JSON.stringify([s.studentId, c.id, i]);
                    const saved =
                      s.marks.find(
                        (mark) =>
                          mark.componentId === c.id &&
                          mark.occurrenceIndex === i,
                      )?.marks ?? null;
                    const value = draft[key]?.text ?? String(saved ?? "");
                    return (
                      <View key={key} style={styles.mark}>
                        <TextField
                          label={`${c.name}${c.slots > 1 ? ` ${i + 1}` : ""} / ${c.maxMarks}`}
                          accessibilityLabel={`${s.name}: ${c.name}${c.slots > 1 ? ` ${i + 1}` : ""} / ${c.maxMarks}`}
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
                      </View>
                    );
                  }),
                )}
              </View>
            </Panel>
          ))}
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  fields: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  mark: { flexGrow: 1, flexBasis: 120 },
});
