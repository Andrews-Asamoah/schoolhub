import { useState } from "react";
import { Alert } from "react-native";
import {
  bulkRecommendTeacherReports,
  getTeacherReportPreview,
  getTeacherReportQueue,
  recommendTeacherReport,
  recommendationSchema,
  saveTeacherReportDraft,
} from "@/api/teacher";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { ReportPreview } from "@/features/shared/ReportPreview";
import { useScopedMutation } from "@/features/shared/mutations";
import { useTeacherQuery } from "./queries";
import { TeacherPage, QueryState, Panel, Copy } from "./ui";

export function TeacherReports() {
  const q = useTeacherQuery(["report-queue"], (signal) =>
    getTeacherReportQueue({ signal }),
  );
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [previewId, setPreview] = useState("");
  const [notice, setNotice] = useState("");
  const preview = useTeacherQuery(
    ["report-preview", previewId],
    (signal) => getTeacherReportPreview({ signal, params: { id: previewId } }),
    !!previewId,
  );
  const draft = useScopedMutation(saveTeacherReportDraft);
  const recommend = useScopedMutation(recommendTeacherReport);
  const bulk = useScopedMutation(bulkRecommendTeacherReports);
  const busy = draft.isPending || recommend.isPending || bulk.isPending;
  const chosen = (q.data ?? [])
    .filter((row) => selected.includes(row.id) && row.stage === "GENERATED")
    .map((row) => ({
      id: row.id,
      remark: remarks[row.id] ?? row.draftRemark ?? "",
    }));
  const valid =
    chosen.length > 0 &&
    chosen.every((row) => recommendationSchema.safeParse(row).success);

  async function run(action: () => Promise<string>) {
    setNotice("");
    try {
      setNotice(await action());
    } catch (failure) {
      setNotice(
        failure instanceof Error
          ? failure.message
          : "The recommendation could not be saved.",
      );
    }
  }

  return (
    <TeacherPage title="Report review" query={q} back>
      {notice ? <Copy alert>{notice}</Copy> : null}
      {chosen.length ? (
        <Button
          label={`Sign off ${chosen.length} selected`}
          disabled={busy || !valid}
          onPress={() => {
            Alert.alert(
              "Sign off selected reports?",
              "This records your recommendations on the selected reports.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Sign off",
                  onPress: () =>
                    void run(async () => {
                      const result = await bulk.mutateAsync({
                        request: { items: chosen },
                      });
                      setSelected(
                        result.results
                          .filter((row) => !row.ok)
                          .map((row) => row.id),
                      );
                      const firstError = result.results.find(
                        (row) => !row.ok,
                      )?.error;
                      return `${result.succeeded} of ${chosen.length} signed off.${firstError ? ` ${firstError}` : ""}`;
                    }),
                },
              ],
            );
          }}
        />
      ) : null}
      <QueryState query={q} empty={!q.data?.length}>
        {q.data?.map((row) => {
          const remark = remarks[row.id] ?? row.draftRemark ?? "";
          const marked = selected.includes(row.id);
          return (
            <Panel
              key={row.id}
              title={`${row.student.profile.firstName} ${row.student.profile.lastName}`}
            >
              <Copy>
                {row.set.name} · {row.set.term.name} ·{" "}
                {row.stage.replaceAll("_", " ").toLowerCase()}
              </Copy>
              <Button
                label={
                  previewId === row.id
                    ? "Close report preview"
                    : "Preview report"
                }
                variant="secondary"
                onPress={() => setPreview(previewId === row.id ? "" : row.id)}
              />
              {previewId === row.id ? (
                <QueryState query={preview}>
                  {preview.data ? (
                    <ReportPreview
                      title={preview.data.pupil.name}
                      data={preview.data.report}
                      approval={preview.data.approval}
                    />
                  ) : null}
                </QueryState>
              ) : null}
              {row.stage === "GENERATED" ? (
                <>
                  <TextField
                    label="Teacher recommendation"
                    value={remark}
                    multiline
                    maxLength={2000}
                    editable={!busy}
                    onChangeText={(value) =>
                      setRemarks((old) => ({ ...old, [row.id]: value }))
                    }
                  />
                  <Button
                    label="Save recommendation draft"
                    variant="secondary"
                    disabled={busy}
                    onPress={() =>
                      void run(async () => {
                        await draft.mutateAsync({
                          params: { id: row.id },
                          request: { remark },
                        });
                        return remark.trim()
                          ? "Recommendation draft saved."
                          : "Recommendation draft cleared.";
                      })
                    }
                  />
                  <Button
                    label="Submit recommendation"
                    disabled={
                      busy ||
                      !recommendationSchema.safeParse({ remark }).success
                    }
                    onPress={() =>
                      void run(async () => {
                        await recommend.mutateAsync({
                          params: { id: row.id },
                          request: { remark },
                        });
                        setSelected((ids) => ids.filter((id) => id !== row.id));
                        return "Recommendation submitted.";
                      })
                    }
                  />
                  <Button
                    label={
                      marked
                        ? "Remove from bulk sign-off"
                        : "Select for bulk sign-off"
                    }
                    variant="ghost"
                    disabled={busy || (!marked && selected.length >= 100)}
                    onPress={() =>
                      setSelected((ids) =>
                        marked
                          ? ids.filter((id) => id !== row.id)
                          : [...ids, row.id],
                      )
                    }
                  />
                </>
              ) : (
                <Copy>{row.teacherRemark ?? "Recommendation recorded."}</Copy>
              )}
            </Panel>
          );
        })}
      </QueryState>
    </TeacherPage>
  );
}
