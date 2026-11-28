import { useState } from "react";
import { File } from "expo-file-system";
import { getDocumentAsync } from "expo-document-picker";
import {
  MARKS_IMPORT_IDENTITY_HEADERS,
  marksImportColumns,
  STUDENT_IMPORT_LIMITS,
} from "@schoolhub/shared";
import {
  applyTeacherMarksImport,
  previewTeacherMarksImport,
  type AssessmentSheet,
} from "@/api/teacher";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import { useScopedMutation } from "@/features/shared/mutations";
import { outputTable } from "@/features/shared/exports";
import { Copy, Panel } from "./ui";

type Preview = Awaited<ReturnType<typeof previewTeacherMarksImport>>;

export function MarksImport({
  sheet,
  onClose,
}: {
  sheet: AssessmentSheet;
  onClose: () => void;
}) {
  const [preview, setPreview] = useState<Preview>();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("fill");
  const [message, setMessage] = useState("");
  const [finished, setFinished] = useState(false);
  const validate = useScopedMutation(previewTeacherMarksImport);
  const apply = useScopedMutation(applyTeacherMarksImport);
  const template = sheet.template;
  if (!template) return null;
  const ref = {
    classId: sheet.class.id,
    subjectId: sheet.subject.id,
    templateId: template.id,
  };
  const columns = marksImportColumns(
    template.components.filter((component) => component.canEdit === true),
  );
  const rows = (preview?.rows ?? []).flatMap(
    ({ row, rowNumber, name, status }) => {
      if (!row || (status !== "ready" && status !== "update")) return [];
      const entries = row.entries.filter(
        (entry) => mode === "replace" || entry.expectedMarks == null,
      );
      return entries.length
        ? [{ row: { studentId: row.studentId, entries }, rowNumber, name }]
        : [];
    },
  );

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (failure) {
      setMessage(
        failure instanceof Error
          ? failure.message
          : "The spreadsheet could not be processed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function selectFile() {
    const result = await getDocumentAsync({
      type: [
        "text/csv",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ],
      copyToCacheDirectory: true,
    });
    const asset = result.assets?.[0];
    if (!asset) return;
    setFinished(false);
    setPreview(undefined);
    try {
      if (!/\.(csv|xlsx)$/i.test(asset.name))
        throw new Error("Choose a CSV or XLSX marks file.");
      const response = await validate.mutateAsync({
        query: ref,
        request: { uri: asset.uri, name: asset.name },
      });
      setPreview(response);
    } finally {
      try {
        const file = new File(asset.uri);
        if (file.exists) file.delete();
      } catch {
        // A cache cleanup failure must not mask validation results.
      }
    }
  }

  async function save() {
    let saved = 0;
    const failures: string[] = [];
    setFinished(true);
    try {
      for (
        let start = 0;
        start < rows.length;
        start += STUDENT_IMPORT_LIMITS.batchSize
      ) {
        const result = await apply.mutateAsync({
          request: {
            ...ref,
            termId: sheet.term.id,
            rows: rows.slice(start, start + STUDENT_IMPORT_LIMITS.batchSize),
          },
        });
        for (const item of result.results) {
          if (item.status === "failed")
            failures.push(
              `Row ${item.rowNumber}: ${item.message ?? "Marks could not be saved."}`,
            );
          else saved++;
        }
      }
      setMessage(
        [`${saved} of ${rows.length} pupil rows saved.`, ...failures].join(
          "\n",
        ),
      );
    } catch (failure) {
      setMessage(
        [
          `${saved} rows confirmed saved. Select the file again to preview the latest marks.`,
          ...failures,
          failure instanceof Error ? failure.message : "",
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
  }

  return (
    <Panel title="Import marks spreadsheet">
      <Copy>
        Choose a CSV or Excel file and review its changes before saving. Blank
        cells leave existing marks intact.
      </Copy>
      {message ? <Copy alert>{message}</Copy> : null}
      <Button
        label="Share Excel template"
        disabled={busy || !columns.length}
        variant="secondary"
        onPress={() =>
          void run(async () => {
            await outputTable(
              "Marks",
              [
                MARKS_IMPORT_IDENTITY_HEADERS.admissionNumber,
                MARKS_IMPORT_IDENTITY_HEADERS.name,
                ...columns.map((column) => column.header),
              ],
              sheet.students.map((student) => [
                student.admissionNumber ?? "",
                student.name,
                ...columns.map(
                  (column) =>
                    student.marks.find(
                      (mark) =>
                        mark.componentId === column.componentId &&
                        mark.occurrenceIndex === column.occurrenceIndex,
                    )?.marks ?? "",
                ),
              ]),
              "xlsx",
            );
          })
        }
      />
      <Button
        label="Choose marks file"
        disabled={busy}
        onPress={() => void run(selectFile)}
      />
      {preview && !finished ? (
        <>
          <SelectField
            label="Existing marks"
            value={mode}
            disabled={busy}
            onChange={setMode}
            options={[
              { value: "fill", label: "Keep existing marks" },
              { value: "replace", label: "Replace changed marks" },
            ]}
          />
          {preview.notices.map((notice) => (
            <Copy key={notice}>{notice}</Copy>
          ))}
          {preview.rows.map((row) => (
            <Copy key={row.rowNumber} alert={row.status === "error"}>
              {row.name || `Row ${row.rowNumber}`} · {row.status}:{" "}
              {[row.detail, ...row.errors].filter(Boolean).join(" ")}
            </Copy>
          ))}
          <Button
            label={`Save ${rows.length} pupil rows`}
            disabled={!rows.length || busy}
            onPress={() => void run(save)}
          />
        </>
      ) : null}
      <Button
        label="Back to score sheet"
        variant="ghost"
        disabled={busy}
        onPress={onClose}
      />
    </Panel>
  );
}
