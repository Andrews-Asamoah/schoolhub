import { useForm } from "@tanstack/react-form";
import { useLocalSearchParams, router, type Href } from "expo-router";
import { useState } from "react";
import {
  getManagedAssignments,
  getTeaching,
  createTeacherAssignment,
  gradeTeacherAssignment,
  managedAssignmentsSchema,
} from "@/api/teacher";
import type { z } from "zod";
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
import { assignmentFormSchema, gradeFormSchema } from "./forms";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";
import { DatePickerField } from "@/components/Fields";
import { ListRow } from "@/components/ListRow";
import { SelectField } from "@/components/SelectField";
export function TeacherAssignments() {
  const q = useTeacherQuery(["assignments"], (signal) =>
    getManagedAssignments({ signal }),
  );
  return (
    <TeacherPage title="Assignments" query={q}>
      <LinkButton
        label="New assignment"
        href={"/(teacher)/teacher-assignment-new" as Href}
      />
      <QueryState query={q} empty={!q.data?.assignments.length}>
        {q.data?.assignments.map((a) => (
          <Panel key={a.id} title={a.title}>
            <Copy>
              {a.class.name} · {a.subject.name} · {a.submissions.length}{" "}
              submitted
            </Copy>
            <Copy>
              {a.dueAt ? `Due ${a.dueAt.slice(0, 10)}` : "No due date"}
            </Copy>
            <LinkButton
              label={`Review ${a.title}`}
              href={
                {
                  pathname: "/(teacher)/teacher-assignment",
                  params: { id: a.id },
                } as Href
              }
            />
          </Panel>
        ))}
      </QueryState>
    </TeacherPage>
  );
}
export function NewTeacherAssignment() {
  const teaching = useTeacherQuery(["overview"], (signal) =>
    getTeaching({ signal }),
  );
  const [pair, setPair] = useState("");
  const [error, setError] = useState("");
  const mutation = useScopedMutation(createTeacherAssignment);
  const pairs =
    teaching.data?.classes.flatMap((c) =>
      c.subjects.map((s) => ({
        value: JSON.stringify([c.id, s.id]),
        label: `${c.name} · ${s.name}`,
      })),
    ) ?? [];
  const form = useForm({
    defaultValues: {
      title: "",
      instructions: "",
      maxScore: "100",
      dueDate: "",
    },
    onSubmit: async ({ value }) => {
      let ids: string[] = [];
      try {
        ids = JSON.parse(pair);
      } catch {
        /* Selection required. */
      }
      const parsed = assignmentFormSchema.safeParse({
        ...value,
        classId: ids[0] ?? "",
        subjectId: ids[1] ?? "",
      });
      if (!parsed.success) {
        setError(
          "Choose a class and subject, a title (3–160 characters), instructions and a positive maximum score.",
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
      <QueryState query={teaching} empty={!pairs.length}>
        <Panel title="Publish to your class">
          <SelectField
            label="Class and subject"
            options={pairs}
            value={pair}
            onChange={setPair}
            disabled={mutation.isPending}
          />
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
              <DatePickerField
                label="Due date (optional)"
                value={field.state.value}
                onChange={field.handleChange}
                disabled={mutation.isPending}
              />
            )}
          </form.Field>
          <Button
            label="Clear due date"
            variant="ghost"
            disabled={mutation.isPending}
            onPress={() => form.setFieldValue("dueDate", "")}
          />
          <Copy>
            Due dates use 23:59 UTC. Publishing immediately notifies the class.
          </Copy>
          {error ? <Copy alert>{error}</Copy> : null}
          <MutationState mutation={mutation} />
          <Button
            label="Publish assignment"
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
  return (
    <TeacherPage title="Assignment review" query={q} back>
      <QueryState query={q} empty={!a}>
        {a ? (
          <>
            <Panel title={a.title}>
              <Copy>
                {a.class.name} · {a.subject.name}
              </Copy>
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
              />
            )}
          </>
        ) : null}
      </QueryState>
    </TeacherPage>
  );
}
