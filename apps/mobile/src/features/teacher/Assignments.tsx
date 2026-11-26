import { useForm } from "@tanstack/react-form";
import { useLocalSearchParams, router, type Href } from "expo-router";
import { useState } from "react";
import { BookOpen, Check, ClipboardList } from "lucide-react-native";
import { Pressable, View } from "react-native";
import {
  getManagedAssignments,
  getTeaching,
  publishTeacherAssignments,
  gradeTeacherAssignment,
  managedAssignmentsSchema,
} from "@/api/teacher";
import type { z } from "zod";
import { formatDateTime } from "@/features/shared/format";
import { useScopedMutation } from "@/features/shared/mutations";
import { useTeacherQuery } from "./queries";
import { TeacherPage, QueryState, Panel, Copy, MutationState } from "./ui";
import { assignmentBatchFormSchema, gradeFormSchema } from "./forms";
import { Button } from "@/components/Button";
import { Text } from "@/components/Typography";
import { FormField } from "@/components/FormField";
import { SearchBar } from "@/components/Fields";
import {
  CalendarDateField,
  formatCalendarDate,
} from "@/components/CalendarDateField";
import { StatusPill } from "@/components/ModulePrimitives";
import { Surface } from "@/components/Surface";
import { spacing, type, useTheme } from "@/theme/theme";
import { ListRow } from "@/components/ListRow";
import { SelectField } from "@/components/SelectField";
export function TeacherAssignments() {
  const q = useTeacherQuery(["assignments"], (signal) =>
    getManagedAssignments({ signal }),
  );
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const assignments =
    q.data?.assignments.filter((assignment) =>
      [assignment.title, assignment.class.name, assignment.subject.name].some(
        (text) => text.toLowerCase().includes(term),
      ),
    ) ?? [];
  return (
    <TeacherPage
      title="Assignments"
      subtitle={
        q.data
          ? [q.data.academicYear?.name, q.data.term.name]
              .filter(Boolean)
              .join(" · ")
          : undefined
      }
      query={q}
      right={
        <Button
          label="New assignment"
          block={false}
          onPress={() => router.push("/(teacher)/teacher-assignment-new")}
        />
      }
    >
      {q.data?.assignments.length ? (
        <SearchBar
          label="Search assignments"
          value={search}
          onChange={setSearch}
        />
      ) : null}
      {q.data ? (
        <View
          style={{ flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }}
        >
          <StatusPill
            label={`${q.data.assignments.filter((item) => item.status === "PUBLISHED").length} published`}
            hue="emerald"
          />
          <StatusPill
            label={`${q.data.assignments.reduce((count, item) => count + item.submissions.length, 0)} submissions`}
            hue="sky"
          />
          <StatusPill
            label={`${q.data.assignments.reduce((count, item) => count + item.submissions.filter((submission) => submission.status === "SUBMITTED").length, 0)} awaiting grades`}
            hue="amber"
          />
        </View>
      ) : null}
      <QueryState query={q} empty={!assignments.length}>
        {assignments.map((a) => {
          const pending = a.submissions.filter(
            (submission) => submission.score === null,
          ).length;
          const dueDate = a.dueAt && a.dueAt.slice(0, 10);
          return (
            <Surface key={a.id}>
              <ListRow
                title={a.title}
                subtitle={`${a.class.name} · ${a.subject.name}`}
                leading={<BookOpen size={20} color={colors.primary} />}
                hue="emerald"
                chevron
                divider
                onPress={() =>
                  router.push({
                    pathname: "/(teacher)/teacher-assignment",
                    params: { id: a.id },
                  } as Href)
                }
              />
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: spacing.sm,
                  paddingTop: spacing.md,
                }}
              >
                <StatusPill
                  label={
                    dueDate
                      ? `Due ${formatCalendarDate(dueDate)}`
                      : "No due date"
                  }
                  hue="emerald"
                />
                <StatusPill
                  label={
                    pending
                      ? `${pending} to grade`
                      : `${a.submissions.length} submitted`
                  }
                  hue={pending ? "amber" : "sky"}
                />
              </View>
            </Surface>
          );
        })}
      </QueryState>
    </TeacherPage>
  );
}

export function NewTeacherAssignment() {
  const teaching = useTeacherQuery(["overview"], (signal) =>
    getTeaching({ signal }),
  );
  const [subjectId, setSubject] = useState("");
  const [classIds, setClasses] = useState<string[]>([]);
  const [error, setError] = useState("");
  const mutation = useScopedMutation(publishTeacherAssignments);
  const { colors } = useTheme();
  const classes = teaching.data?.classes ?? [];
  const subjects = [
    ...new Map(
      classes.flatMap((item) =>
        item.subjects.map(
          (subject) =>
            [subject.id, { value: subject.id, label: subject.name }] as const,
        ),
      ),
    ).values(),
  ];
  const eligibleClasses = classes.filter((item) =>
    item.subjects.some((subject) => subject.id === subjectId),
  );
  const selected = eligibleClasses
    .filter((item) => classIds.includes(item.id))
    .map((item) => item.id);
  const form = useForm({
    defaultValues: {
      title: "",
      instructions: "",
      maxScore: "100",
      dueDate: "",
    },
    onSubmit: async ({ value }) => {
      const parsed = assignmentBatchFormSchema.safeParse({
        ...value,
        classIds: selected,
        subjectId,
      });
      if (!parsed.success) {
        setError(
          "Choose a subject and at least one class. Check the title, instructions, and maximum score.",
        );
        return;
      }
      setError("");
      try {
        await mutation.mutateAsync({ request: parsed.data });
        router.back();
      } catch {
        /* Safe static feedback below. */
      }
    },
  });
  return (
    <TeacherPage title="New assignment" query={teaching} back>
      <QueryState query={teaching} empty={!subjects.length}>
        <Panel title="Audience and instructions">
          <SelectField
            label="Subject"
            options={subjects}
            value={subjectId}
            onChange={(value) => {
              setSubject(value);
              setClasses([]);
            }}
            disabled={mutation.isPending}
          />
          {subjectId ? (
            <>
              <Copy heading>Classes · {selected.length} selected</Copy>
              {eligibleClasses.map((item) => {
                const checked = selected.includes(item.id);
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="checkbox"
                    accessibilityLabel={item.name}
                    accessibilityState={{
                      checked,
                      disabled:
                        mutation.isPending ||
                        (!checked && selected.length >= 50),
                    }}
                    disabled={
                      mutation.isPending || (!checked && selected.length >= 50)
                    }
                    onPress={() =>
                      setClasses((previous) =>
                        checked
                          ? previous.filter((value) => value !== item.id)
                          : [...previous, item.id],
                      )
                    }
                    style={({ pressed }) => ({
                      minHeight: 48,
                      paddingHorizontal: spacing.md,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: spacing.sm,
                      borderWidth: 1,
                      borderRadius: 12,
                      borderColor: checked ? colors.primary : colors.border,
                      backgroundColor:
                        pressed || checked ? colors.muted : colors.card,
                    })}
                  >
                    <Text
                      style={[
                        type.bodyStrong,
                        { color: colors.foreground, flexShrink: 1 },
                      ]}
                    >
                      {item.name}
                    </Text>
                    {checked ? (
                      <Check
                        size={19}
                        color={colors.primary}
                        accessible={false}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </>
          ) : null}
          <form.Field name="title">
            {(field) => (
              <FormField
                field={field}
                label="Title"
                maxLength={160}
                editable={!mutation.isPending}
              />
            )}
          </form.Field>
          <form.Field name="instructions">
            {(field) => (
              <FormField
                field={field}
                label="Instructions"
                multiline
                maxLength={10000}
                editable={!mutation.isPending}
              />
            )}
          </form.Field>
        </Panel>
        <Panel title="Grading and deadline">
          <form.Field name="maxScore">
            {(field) => (
              <FormField
                field={field}
                label="Maximum score"
                keyboardType="decimal-pad"
                editable={!mutation.isPending}
              />
            )}
          </form.Field>
          <form.Field name="dueDate">
            {(field) => (
              <CalendarDateField
                label="Due date (optional)"
                value={field.state.value}
                onChange={field.handleChange}
                disabled={mutation.isPending}
              />
            )}
          </form.Field>
          <Copy>
            Due dates use 23:59 Ghana time. Publishing notifies students in the
            selected classes.
          </Copy>
          {error ? <Copy alert>{error}</Copy> : null}
          <MutationState mutation={mutation} />
          <Button
            label={
              selected.length > 1
                ? `Publish to ${selected.length} classes`
                : "Publish assignment"
            }
            loading={mutation.isPending}
            onPress={() => {
              void form.handleSubmit();
            }}
          />
        </Panel>
      </QueryState>
    </TeacherPage>
  );
}
type Submission = z.infer<
  typeof managedAssignmentsSchema
>["assignments"][number]["submissions"][number];
function GradeForm({
  submission,
  max,
  id,
}: {
  submission: Submission;
  max: number;
  id: string;
}) {
  const mutation = useScopedMutation(gradeTeacherAssignment);
  const [error, setError] = useState("");
  const form = useForm({
    defaultValues: {
      score: submission.score === null ? "" : String(submission.score),
      feedback: submission.feedback ?? "",
    },
    onSubmit: async ({ value }) => {
      const p = gradeFormSchema.safeParse(value);
      if (!p.success || p.data.score > max) {
        setError(
          `Enter a score from 0 to ${max} and feedback up to 2,000 characters.`,
        );
        return;
      }
      setError("");
      try {
        await mutation.mutateAsync({
          params: { id, submissionId: submission.id },
          request: p.data,
        });
      } catch {
        /* Static feedback. */
      }
    },
  });
  return (
    <Panel
      title={`${submission.student.profile.firstName} ${submission.student.profile.lastName}`}
    >
      <Copy>
        {submission.status} · {submission.score ?? "Not graded"} / {max}
      </Copy>
      {submission.submittedAt ? (
        <Copy>
          {[
            submission.student.admissionNumber ?? submission.student.studentId,
            `Submitted ${formatDateTime(submission.submittedAt)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Copy>
      ) : null}
      {submission.gradedBy ? (
        <Copy>Graded by {submission.gradedBy.name}</Copy>
      ) : null}
      <Copy>{submission.responseText}</Copy>
      <form.Field name="score">
        {(field) => (
          <FormField
            field={field}
            label="Score"
            keyboardType="decimal-pad"
            editable={!mutation.isPending}
          />
        )}
      </form.Field>
      <form.Field name="feedback">
        {(field) => (
          <FormField
            field={field}
            label="Feedback"
            multiline
            maxLength={2000}
            editable={!mutation.isPending}
          />
        )}
      </form.Field>
      {error ? <Copy alert>{error}</Copy> : null}
      <MutationState mutation={mutation} />
      <Button
        label="Save grade"
        loading={mutation.isPending}
        onPress={() => {
          void form.handleSubmit();
        }}
      />
    </Panel>
  );
}
export function TeacherAssignment() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const q = useTeacherQuery(["assignments"], (signal) =>
    getManagedAssignments({ signal }),
  );
  const a = q.data?.assignments.find((a) => a.id === id);
  const { colors } = useTheme();
  return (
    <TeacherPage title="Assignment review" query={q} back>
      <QueryState query={q} empty={!a}>
        {a ? (
          <>
            <Panel title={a.title}>
              <Copy>
                {a.class.name} · {a.subject.name}
              </Copy>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: spacing.sm,
                }}
              >
                <StatusPill label={`${a.maxScore} points`} hue="sky" />
                <StatusPill
                  label={
                    a.dueAt
                      ? `Due ${formatCalendarDate(a.dueAt.slice(0, 10))}`
                      : "No due date"
                  }
                  hue="emerald"
                />
                <StatusPill
                  label={`${a.submissions.length} submitted`}
                  hue="violet"
                />
              </View>
              <Copy>{a.instructions}</Copy>
            </Panel>
            {a.submissions.length ? (
              a.submissions.map((s) => (
                <GradeForm
                  key={s.id}
                  submission={s}
                  max={a.maxScore}
                  id={a.id}
                />
              ))
            ) : (
              <ListRow
                title="No submissions yet"
                subtitle="Pull to refresh when pupils have responded."
                leading={<ClipboardList size={20} color={colors.primary} />}
              />
            )}
          </>
        ) : null}
      </QueryState>
    </TeacherPage>
  );
}
