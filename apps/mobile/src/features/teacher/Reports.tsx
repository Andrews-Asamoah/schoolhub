import { useForm } from "@tanstack/react-form";
import { useLocalSearchParams } from "expo-router";
import {
  getTeacherReportQueue,
  recommendTeacherReport,
  recommendationSchema,
} from "@/api/teacher";
import {
  getTeacherMockReports,
  recommendTeacherMock,
} from "@/api/teacher-mocks";
import { useTeacherQuery } from "./queries";
import { useScopedMutation } from "@/features/shared/mutations";
import { TeacherPage, QueryState, Panel, Copy, MutationState } from "./ui";
import { FormField } from "@/components/FormField";
import { Button } from "@/components/Button";
import { useState } from "react";
function Recommendation({ id, mock = false }: { id: string; mock?: boolean }) {
  const mutation = useScopedMutation(
    mock ? recommendTeacherMock : recommendTeacherReport,
  );
  const [error, setError] = useState("");
  const form = useForm({
    defaultValues: { remark: "" },
    validators: { onSubmit: recommendationSchema },
    onSubmit: async ({ value }) => {
      try {
        setError("");
        await mutation.mutateAsync({
          params: { id },
          request: recommendationSchema.parse(value),
        });
      } catch {
        setError(
          "Recommendation was not saved. Refresh to check the report's review stage.",
        );
      }
    },
  });
  return (
    <>
      <form.Field name="remark">
        {(field) => (
          <FormField
            field={field}
            label="Teacher recommendation"
            multiline
            maxLength={2000}
            editable={!mutation.isPending}
          />
        )}
      </form.Field>
      <Copy>
        Write 10–2,000 characters. Recommendations become read-only after
        submission.
      </Copy>
      {error ? <Copy alert>{error}</Copy> : null}
      <MutationState mutation={mutation} />
      <Button
        label="Submit recommendation"
        loading={mutation.isPending}
        onPress={() => {
          void form.handleSubmit();
        }}
      />
    </>
  );
}
export function TeacherReports() {
  const q = useTeacherQuery(["report-queue"], (signal) =>
    getTeacherReportQueue({ signal }),
  );
  return (
    <TeacherPage title="Report review" query={q} back>
      <QueryState query={q} empty={!q.data?.length}>
        {q.data?.map((r) => (
          <Panel
            key={r.id}
            title={`${r.student.profile.firstName} ${r.student.profile.lastName}`}
          >
            <Copy>
              {r.set.name} · {r.set.term.name} · {r.stage}
            </Copy>
            {r.subjects.map((s, i) => (
              <Copy key={i}>
                {s.name}:{" "}
                {s.percentage == null ? "Incomplete" : `${s.percentage}%`} ·{" "}
                {s.grade ?? "No grade"}
              </Copy>
            ))}
            {r.stage === "GENERATED" ? (
              <Recommendation id={r.id} />
            ) : (
              <Copy>{r.teacherRemark ?? "Recommendation recorded."}</Copy>
            )}
          </Panel>
        ))}
      </QueryState>
    </TeacherPage>
  );
}
export function TeacherMockReports() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const q = useTeacherQuery(
    ["mock-reports", id],
    (signal) => getTeacherMockReports({ signal, params: { id } }),
    !!id,
  );
  return (
    <TeacherPage title="Mock report review" query={q} back>
      <QueryState query={q} empty={!q.data?.reports.length}>
        {q.data?.reports.map((r) => (
          <Panel key={r.id} title={r.snapshot.pupil.name}>
            <Copy>
              {r.stage} · Average {r.snapshot.average ?? "Unavailable"}
            </Copy>
            {r.snapshot.papers.map((p, i) => (
              <Copy key={i}>
                {p.name}: {p.percentage ?? "Absent"} · {p.grade ?? "No grade"}
              </Copy>
            ))}
            {!r.integrityOk ? (
              <Copy alert>
                Report integrity could not be verified. Ask the school to review
                it.
              </Copy>
            ) : r.stage === "GENERATED" ? (
              <Recommendation id={r.id} mock />
            ) : (
              <Copy>{r.teacherRemark ?? "Recommendation recorded."}</Copy>
            )}
          </Panel>
        ))}
      </QueryState>
    </TeacherPage>
  );
}
