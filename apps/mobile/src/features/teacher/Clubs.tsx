import { useState } from "react";
import {
  getTeaching,
  getRoster,
  getTeacherClubs,
  getTeacherClub,
  addTeacherClubMember,
  removeTeacherClubMember,
} from "@/api/teacher";
import { useTeacherQuery } from "./queries";
import { useScopedMutation } from "@/features/shared/mutations";
import { TeacherPage, QueryState, Panel, Copy, MutationState } from "./ui";
import { SelectField } from "@/components/SelectField";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/Dialogs";
export default function TeacherClubs() {
  const [clubId, setClub] = useState("");
  const clubs = useTeacherQuery(["clubs"], (signal) =>
    getTeacherClubs({ signal }),
  );
  return (
    <TeacherPage title="Clubs" query={clubs} back>
      <QueryState query={clubs} empty={!clubs.data?.length}>
        <Panel title="School clubs">
          <SelectField
            label="Club"
            value={clubId}
            options={
              clubs.data?.map((c) => ({
                value: c.id,
                label: `${c.name}${c.isActive ? "" : " · Inactive"}`,
              })) ?? []
            }
            onChange={setClub}
          />
        </Panel>
        {clubId ? (
          <ClubEditor
            key={clubId}
            clubId={clubId}
            active={!!clubs.data?.find((c) => c.id === clubId)?.isActive}
          />
        ) : null}
      </QueryState>
    </TeacherPage>
  );
}
function ClubEditor({ clubId, active }: { clubId: string; active: boolean }) {
  const q = useTeacherQuery(["club", clubId], (signal) =>
    getTeacherClub({ signal, params: { id: clubId } }),
  );
  const teaching = useTeacherQuery(["overview"], (signal) =>
    getTeaching({ signal }),
  );
  const [classId, setClass] = useState("");
  const [studentId, setStudent] = useState("");
  const [remove, setRemove] = useState<{ id: string; name: string } | null>(
    null,
  );
  const roster = useTeacherQuery(
    ["roster", classId],
    (signal) => getRoster({ signal, params: { id: classId } }),
    !!classId,
  );
  const add = useScopedMutation(addTeacherClubMember);
  const del = useScopedMutation(removeTeacherClubMember);
  const busy = add.isPending || del.isPending;
  return (
    <>
      <QueryState query={q}>
        {q.data ? (
          <Panel title={q.data.name}>
            {!q.data.members.length ? (
              <Copy>No members yet.</Copy>
            ) : (
              q.data.members.map((m) => (
                <Button
                  key={m.id}
                  label={`Remove ${m.student.profile.firstName} ${m.student.profile.lastName} (${m.role})`}
                  variant="secondary"
                  disabled={busy}
                  onPress={() =>
                    setRemove({
                      id: m.student.id,
                      name: `${m.student.profile.firstName} ${m.student.profile.lastName}`,
                    })
                  }
                />
              ))
            )}
            <MutationState mutation={del} />
          </Panel>
        ) : null}
      </QueryState>
      <Panel title="Add a pupil">
        <QueryState query={teaching} empty={!teaching.data?.classes.length}>
          <SelectField
            label="Pupil's class"
            value={classId}
            options={
              teaching.data?.classes.map((c) => ({
                value: c.id,
                label: c.name,
              })) ?? []
            }
            disabled={busy || !active}
            onChange={(id) => {
              setClass(id);
              setStudent("");
            }}
          />
          {classId ? (
            <QueryState query={roster} empty={!roster.data?.length}>
              <SelectField
                label="Pupil"
                value={studentId}
                options={
                  roster.data
                    ?.filter(
                      (s) =>
                        !q.data?.members.some((m) => m.student.id === s.id),
                    )
                    .map((s) => ({
                      value: s.id,
                      label: `${s.profile.firstName} ${s.profile.lastName}`,
                    })) ?? []
                }
                disabled={busy}
                onChange={setStudent}
              />
            </QueryState>
          ) : null}
          <MutationState mutation={add} />
          <Button
            label="Add club member"
            loading={add.isPending}
            disabled={!studentId || !active || busy || q.isPending || q.isError}
            onPress={() => {
              void add
                .mutateAsync({
                  params: { id: clubId },
                  request: { studentId, role: "Member" },
                })
                .then(() => setStudent(""))
                .catch(() => {});
            }}
          />
        </QueryState>
      </Panel>
      <ConfirmDialog
        visible={!!remove}
        title="Remove club member?"
        message={remove ? `Remove ${remove.name} from this club?` : ""}
        loading={del.isPending}
        destructive
        onClose={() => {
          if (!del.isPending) setRemove(null);
        }}
        onConfirm={() => {
          if (remove)
            void del
              .mutateAsync({ params: { id: clubId, studentId: remove.id } })
              .then(() => setRemove(null))
              .catch(() => setRemove(null));
        }}
      />
    </>
  );
}
