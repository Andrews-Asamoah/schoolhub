import { useState } from "react";
import { useLocalSearchParams, type Href } from "expo-router";
import {
  getTeacherMocks,
  getTeacherMockPaper,
  saveTeacherMockMarks,
  finalizeTeacherMock,
  getTeacherCorrections,
  requestTeacherCorrection,
  correctionSchema,
  type MockSheet,
} from "@/api/teacher-mocks";
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
import { TextField } from "@/components/TextField";
import { SelectField } from "@/components/SelectField";
import { ConfirmDialog } from "@/components/Dialogs";
import { numericMark } from "./forms";
export function TeacherMocks() {
  const q = useTeacherQuery(["mocks"], (signal) => getTeacherMocks({ signal }));
  return (
    <TeacherPage title="Internal mock exams" query={q} back>
      <QueryState query={q} empty={!q.data?.length}>
        {q.data?.map((e) => (
          <Panel key={e.id} title={e.name}>
            <Copy>
              {e.class.name} · {e.status}
            </Copy>
            {e.papers.map((p) => (
              <LinkButton
                key={p.id}
                label={`${p.nameSnapshot}${p.finalizedAt ? " · Finalized" : ""}`}
                href={
                  {
                    pathname: "/(teacher)/teacher-mock-paper",
                    params: { id: p.id },
                  } as Href
                }
              />
            ))}
            <LinkButton
              label="Mock report review"
              href={
                {
                  pathname: "/(teacher)/teacher-mock-reports",
                  params: { id: e.id },
                } as Href
              }
            />
          </Panel>
        ))}
      </QueryState>
    </TeacherPage>
  );
}
export function TeacherMockPaper() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const q = useTeacherQuery(
    ["mock-paper", id],
    (signal) => getTeacherMockPaper({ signal, params: { id } }),
    !!id,
  );
  return (
    <TeacherPage title="Mock marks" query={q} back>
      <QueryState query={q}>
        {q.data ? <MockEditor key={id} sheet={q.data} /> : null}
      </QueryState>
    </TeacherPage>
  );
}
type Draft = {
  status: "MARKED" | "ABSENT";
  marks: string;
  expectedVersion: number;
};
function MockEditor({ sheet }: { sheet: MockSheet }) {
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const save = useScopedMutation(saveTeacherMockMarks);
  const finalize = useScopedMutation(finalizeTeacherMock);
  const busy = save.isPending || finalize.isPending;
  const dirty = Object.keys(draft).length > 0;
  function edit(id: string, patch: Partial<Draft>) {
    const c = sheet.candidates.find((c) => c.id === id)!;
    setDraft((prev) => ({
      ...prev,
      [id]: {
        status: c.status ?? "MARKED",
        marks: c.marks === null ? "" : String(c.marks),
        expectedVersion: c.version,
        ...prev[id],
        ...patch,
      },
    }));
  }
  async function submit() {
    try {
      const entries = Object.entries(draft).map(([candidateId, d]) => ({
        candidateId,
        status: d.status,
        marks:
          d.status === "ABSENT"
            ? null
            : numericMark(d.marks, sheet.paper.maxMarks, false),
        expectedVersion: d.expectedVersion,
      }));
      setError("");
      await save.mutateAsync({ request: { paperId: sheet.paper.id, entries } });
      setDraft({});
    } catch {
      setError(
        "Marks were not saved. Check the maximum and required marks. If another teacher changed this sheet, discard edits and refresh before retrying.",
      );
    }
  }
  return (
    <>
      <Panel title={`${sheet.session.name} · ${sheet.paper.name}`}>
        <Copy>
          {sheet.session.status} · Maximum {sheet.paper.maxMarks}
        </Copy>
        {!sheet.canEdit ? (
          <Copy alert>
            This paper is read-only: it may be finalized, closed or assigned to
            another teacher.
          </Copy>
        ) : null}
        {dirty ? (
          <Copy alert>
            Unsaved marks. Blank is unmarked; choose Absent explicitly.
          </Copy>
        ) : null}
        {error ? <Copy alert>{error}</Copy> : null}
        <MutationState mutation={save} />
        <MutationState mutation={finalize} />
        <Button
          label="Save mock marks"
          disabled={!sheet.canEdit || !dirty}
          loading={busy}
          onPress={() => {
            void submit();
          }}
        />
        <Button
          label="Discard mock edits"
          variant="ghost"
          disabled={!dirty || busy}
          onPress={() => {
            setDraft({});
            setError("");
            save.reset();
          }}
        />
        <Button
          label="Finalize paper"
          variant="secondary"
          disabled={
            !sheet.canEdit ||
            dirty ||
            busy ||
            !sheet.candidates.length ||
            sheet.candidates.some((c) => c.status === null)
          }
          onPress={() => setConfirm(true)}
        />
        <LinkButton
          label="Corrections and requests"
          href={
            {
              pathname: "/(teacher)/teacher-mock-corrections",
              params: { id: sheet.paper.id },
            } as Href
          }
        />
      </Panel>
      {sheet.candidates.map((c) => {
        const d = draft[c.id];
        const status = d?.status ?? c.status ?? "MARKED";
        return (
          <Panel key={c.id} title={c.name}>
            <Copy>
              {c.status ?? "UNMARKED"} · Version {c.version}
            </Copy>
            <SelectField
              label={`Mark status for ${c.name}`}
              value={status}
              options={[
                { value: "MARKED", label: "Marked" },
                { value: "ABSENT", label: "Absent" },
              ]}
              disabled={!sheet.canEdit || busy}
              onChange={(value) =>
                edit(c.id, { status: value as Draft["status"] })
              }
            />
            <TextField
              label={`${c.name}: marks / ${sheet.paper.maxMarks}`}
              value={d?.marks ?? (c.marks === null ? "" : String(c.marks))}
              keyboardType="decimal-pad"
              editable={sheet.canEdit && !busy && status !== "ABSENT"}
              onChangeText={(marks) => edit(c.id, { marks })}
            />
          </Panel>
        );
      })}
      <ConfirmDialog
        visible={confirm}
        title="Finalize this paper?"
        message="Marks will become read-only. Later amendments require a correction request."
        confirmLabel="Finalize"
        loading={finalize.isPending}
        onClose={() => {
          if (!finalize.isPending) setConfirm(false);
        }}
        onConfirm={() => {
          void finalize
            .mutateAsync({ params: { id: sheet.paper.id } })
            .then(() => setConfirm(false))
            .catch(() => setConfirm(false));
        }}
      />
    </>
  );
}
export function TeacherMockCorrections() {
  const { id = "" } = useLocalSearchParams<{ id: string }>();
  const paper = useTeacherQuery(
    ["mock-paper", id],
    (signal) => getTeacherMockPaper({ signal, params: { id } }),
    !!id,
  );
  return (
    <TeacherPage title="Mock corrections" query={paper} back>
      <QueryState query={paper}>
        {paper.data ? <CorrectionForm key={id} sheet={paper.data} /> : null}
      </QueryState>
    </TeacherPage>
  );
}
function CorrectionForm({ sheet }: { sheet: MockSheet }) {
  const q = useTeacherQuery(["mock-corrections", sheet.session.id], (signal) =>
    getTeacherCorrections({ signal, params: { id: sheet.session.id } }),
  );
  const mutation = useScopedMutation(requestTeacherCorrection);
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState("MARKED");
  const [marks, setMarks] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  async function submit() {
    try {
      const parsed = correctionSchema.parse({
        paperId: sheet.paper.id,
        candidateId: selected,
        status,
        marks:
          status === "ABSENT"
            ? null
            : numericMark(marks, sheet.paper.maxMarks, false),
        expectedVersion: version,
        reason,
      });
      setError("");
      await mutation.mutateAsync({
        params: { id: sheet.session.id },
        request: parsed,
      });
      setReason("");
      setSelected("");
    } catch {
      setError(
        "Request not saved. Choose an already marked pupil, a valid mark and a reason of 10–2,000 characters. Refresh if the version has changed.",
      );
    }
  }
  return (
    <>
      <Panel title="Request a correction">
        <Copy>
          Approval stays with the headteacher on the web. Your request does not
          change marks immediately.
        </Copy>
        <SelectField
          label="Pupil to correct"
          value={selected}
          options={sheet.candidates
            .filter((c) => c.version > 0)
            .map((c) => ({
              value: c.id,
              label: `${c.name} · version ${c.version}`,
            }))}
          disabled={mutation.isPending}
          onChange={(id) => {
            const c = sheet.candidates.find((c) => c.id === id)!;
            setSelected(id);
            setVersion(c.version);
            setStatus(c.status ?? "MARKED");
            setMarks(c.marks === null ? "" : String(c.marks));
          }}
        />
        <SelectField
          label="Requested status"
          value={status}
          options={[
            { value: "MARKED", label: "Marked" },
            { value: "ABSENT", label: "Absent" },
          ]}
          disabled={mutation.isPending}
          onChange={setStatus}
        />
        <TextField
          label="Requested mark"
          value={marks}
          onChangeText={setMarks}
          keyboardType="decimal-pad"
          editable={!mutation.isPending && status !== "ABSENT"}
        />
        <TextField
          label="Reason for correction"
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={2000}
          editable={!mutation.isPending}
        />
        {error ? <Copy alert>{error}</Copy> : null}
        <MutationState mutation={mutation} />
        <Button
          label="Request correction"
          loading={mutation.isPending}
          disabled={!selected}
          onPress={() => {
            void submit();
          }}
        />
      </Panel>
      <Panel title="Recent requests">
        <QueryState query={q} empty={!q.data?.length}>
          {q.data?.map((r) => (
            <Panel
              key={r.id}
              title={`${r.candidate.nameSnapshot} · ${r.paper.nameSnapshot}`}
            >
              <Copy>{r.status}</Copy>
              <Copy>{r.reason}</Copy>
            </Panel>
          ))}
        </QueryState>
      </Panel>
    </>
  );
}
