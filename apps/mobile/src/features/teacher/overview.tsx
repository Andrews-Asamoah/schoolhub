import { router, type Href, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  getTeaching,
  getTeacherClasses,
  getTeacherTimetable,
  getRegisterGaps,
  getRoster,
  getTeacherStudent,
  getTeacherStudentSubjects,
  getTeacherStudentAttendance,
  getTeacherStudentReport,
} from "@/api/teacher";
import { useTeacherQuery } from "./queries";
import { TeacherPage, QueryState, Panel, Copy, LinkButton } from "./ui";
import { ListRow } from "@/components/ListRow";
import { SearchBar } from "@/components/Fields";
import { HeroCard } from "@/components/HeroCard";
const go = (path: string, params?: Record<string, string>) =>
  router.push({ pathname: path, params } as Href);
export function TeacherHome() {
  const teaching = useTeacherQuery(["overview"], (signal) =>
    getTeaching({ signal }),
  );
  const timetable = useTeacherQuery(["timetable"], (signal) =>
    getTeacherTimetable({ signal }),
  );
  const today = [
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
  ][new Date().getDay()];
  const lessons =
    timetable.data?.entries.filter((e) => e.dayOfWeek === today) ?? [];
  return (
    <TeacherPage
      title="Home"
      query={{
        isRefetching: teaching.isRefetching || timetable.isRefetching,
        refetch: () => Promise.all([teaching.refetch(), timetable.refetch()]),
      }}
    >
      <QueryState
        query={teaching}
        empty={!!teaching.data && !teaching.data.classes.length}
      >
        <HeroCard
          greeting={teaching.data?.teacher?.name ?? "Your teaching day"}
          metric={`${teaching.data?.classes.length ?? 0} classes`}
          detail={teaching.data?.term?.name ?? "Current term"}
        />
        {teaching.data?.classes
          .filter((c) => c.isClassTeacher)
          .map((c) => (
            <ClassGaps key={c.id} id={c.id} name={c.name} />
          ))}
      </QueryState>
      <Panel title="Today's timetable">
        <QueryState query={timetable} empty={!lessons.length}>
          {lessons.map((e) => (
            <ListRow
              key={e.id}
              title={e.subject?.name ?? e.label ?? e.type}
              subtitle={`${e.startTime}–${e.endTime} · ${e.class?.name ?? ""} · ${e.classroom?.name ?? ""}`}
            />
          ))}
        </QueryState>
        <LinkButton
          label="Weekly timetable"
          href={"/(teacher)/teacher-timetable" as Href}
        />
      </Panel>
    </TeacherPage>
  );
}
function ClassGaps({ id, name }: { id: string; name: string }) {
  const gaps = useTeacherQuery(["gaps", id], (signal) =>
    getRegisterGaps({ signal, params: { classId: id } }),
  );
  return (
    <Panel title={`${name} register`}>
      <QueryState query={gaps}>
        <Copy>
          {gaps.data?.missingMarks ?? 0} missing marks across{" "}
          {gaps.data?.incompleteDays ?? 0} days
        </Copy>
        {gaps.data?.days
          .slice(-5)
          .reverse()
          .map((d) => (
            <ListRow
              key={d.date}
              title={d.date}
              subtitle={`${d.missing} unmarked${d.historical ? " · historical diagnostic" : ""}`}
              onPress={() =>
                go("/(teacher)/teacher-register", { classId: id, date: d.date })
              }
            />
          ))}
        <LinkButton
          label={`Open ${name} register`}
          href={
            {
              pathname: "/(teacher)/teacher-register",
              params: { classId: id },
            } as Href
          }
        />
      </QueryState>
    </Panel>
  );
}
export function TeacherClasses() {
  const teaching = useTeacherQuery(["overview"], (signal) =>
    getTeaching({ signal }),
  );
  const catalogue = useTeacherQuery(["classes"], (signal) =>
    getTeacherClasses({ signal }),
  );
  const [search, setSearch] = useState("");
  const classes =
    teaching.data?.classes.filter(
      (c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) &&
        catalogue.data?.some((row) => row.id === c.id),
    ) ?? [];
  return (
    <TeacherPage
      title="Classes"
      query={{
        isRefetching: teaching.isRefetching || catalogue.isRefetching,
        refetch: () => Promise.all([teaching.refetch(), catalogue.refetch()]),
      }}
    >
      <SearchBar label="Search classes" value={search} onChange={setSearch} />
      <QueryState query={teaching}>
        <QueryState query={catalogue} empty={!classes.length}>
          {classes.map((c) => (
            <Panel key={c.id} title={c.name}>
              <Copy>
                {c.studentCount} pupils ·{" "}
                {c.isClassTeacher ? "Class teacher" : "Subject teacher"}
              </Copy>
              <Copy>
                {c.subjects.map((s) => s.name).join(", ") ||
                  "Class register and roster"}
              </Copy>
              <LinkButton
                label={`View ${c.name} roster`}
                href={
                  {
                    pathname: "/(teacher)/teacher-roster",
                    params: { classId: c.id },
                  } as Href
                }
              />
              <LinkButton
                label={c.isClassTeacher ? "Mark register" : "View register"}
                href={
                  {
                    pathname: "/(teacher)/teacher-register",
                    params: { classId: c.id },
                  } as Href
                }
              />
            </Panel>
          ))}
        </QueryState>
      </QueryState>
    </TeacherPage>
  );
}
export function TeacherRoster() {
  const { classId = "" } = useLocalSearchParams<{ classId: string }>();
  const q = useTeacherQuery(
    ["roster", classId],
    (signal) => getRoster({ signal, params: { id: classId } }),
    !!classId,
  );
  const [search, setSearch] = useState("");
  const rows =
    q.data?.filter((s) =>
      `${s.profile.firstName} ${s.profile.lastName}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <TeacherPage title="Class roster" query={q} back>
      <SearchBar label="Search pupils" value={search} onChange={setSearch} />
      <QueryState query={q} empty={!rows.length}>
        {rows.map((s) => (
          <ListRow
            key={s.id}
            title={`${s.profile.firstName} ${s.profile.lastName}`}
            subtitle={s.admissionNumber ?? undefined}
            onPress={() => go("/(teacher)/teacher-pupil", { studentId: s.id })}
          />
        ))}
      </QueryState>
    </TeacherPage>
  );
}
export function TeacherPupil() {
  const { studentId = "" } = useLocalSearchParams<{ studentId: string }>();
  const teaching = useTeacherQuery(["overview"], (signal) =>
    getTeaching({ signal }),
  );
  const termId = teaching.data?.term?.id;
  const p = useTeacherQuery(
    ["pupil", studentId],
    (signal) => getTeacherStudent({ signal, params: { id: studentId } }),
    !!studentId,
  );
  const subjects = useTeacherQuery(
    ["pupil-subjects", studentId],
    (signal) =>
      getTeacherStudentSubjects({ signal, params: { id: studentId } }),
    !!studentId,
  );
  const a = useTeacherQuery(
    ["pupil-attendance", studentId],
    (signal) => getTeacherStudentAttendance({ signal, params: { studentId } }),
    !!studentId,
  );
  const report = useTeacherQuery(
    ["pupil-report", studentId, termId],
    (signal) =>
      getTeacherStudentReport({
        signal,
        params: { studentId },
        query: { termId },
      }),
    !!studentId && !!termId,
  );
  return (
    <TeacherPage
      title="Student profile"
      query={{
        isRefetching:
          p.isRefetching ||
          subjects.isRefetching ||
          a.isRefetching ||
          report.isRefetching,
        refetch: () =>
          Promise.all([
            p.refetch(),
            subjects.refetch(),
            a.refetch(),
            ...(termId ? [report.refetch()] : []),
          ]),
      }}
      back
    >
      <QueryState query={p}>
        {p.data ? (
          <Panel
            title={`${p.data.profile.firstName} ${p.data.profile.lastName}`}
          >
            <Copy>
              {p.data.class?.name ?? "No class"} ·{" "}
              {p.data.house?.name ?? "No house"}
            </Copy>
            <Copy>
              {p.data.status} · {p.data.admissionNumber ?? ""}
            </Copy>
          </Panel>
        ) : null}
      </QueryState>
      <Panel title="Subjects">
        <QueryState query={subjects} empty={!subjects.data?.subjects.length}>
          {subjects.data?.subjects.map((s) => (
            <ListRow
              key={s.subjectId}
              title={s.name}
              subtitle={s.teacherName ?? undefined}
            />
          ))}
        </QueryState>
      </Panel>
      <Panel title="Attendance">
        <QueryState query={a}>
          <Copy>{a.data?.recordedDays ?? 0} recorded days</Copy>
          <Copy>
            {a.data?.attendanceRate == null
              ? "Attendance rate unavailable"
              : `${a.data.attendanceRate}% attendance`}
          </Copy>
          {Object.entries(a.data?.summary ?? {}).map(([status, count]) => (
            <Copy key={status}>
              {status}: {count}
            </Copy>
          ))}
        </QueryState>
      </Panel>
      <Panel title="Current assessment results">
        <QueryState query={teaching} empty={!termId}>
          {termId ? (
            <QueryState query={report} empty={!report.data?.scores.length}>
              {report.data?.scores.map((s) => (
                <ListRow
                  key={s.id}
                  title={s.subject.name}
                  subtitle={
                    s.percentage == null ? "Incomplete" : `${s.percentage}%`
                  }
                />
              ))}
            </QueryState>
          ) : null}
        </QueryState>
      </Panel>
    </TeacherPage>
  );
}
export function TeacherTimetable() {
  const q = useTeacherQuery(["timetable"], (signal) =>
    getTeacherTimetable({ signal }),
  );
  return (
    <TeacherPage title="Weekly timetable" query={q} back>
      <QueryState query={q} empty={!q.data?.entries.length}>
        {[
          "MONDAY",
          "TUESDAY",
          "WEDNESDAY",
          "THURSDAY",
          "FRIDAY",
          "SATURDAY",
          "SUNDAY",
        ].map((day) => {
          const entries =
            q.data?.entries.filter((e) => e.dayOfWeek === day) ?? [];
          return entries.length ? (
            <Panel key={day} title={day}>
              {entries.map((e) => (
                <ListRow
                  key={e.id}
                  title={e.subject?.name ?? e.label ?? e.type}
                  subtitle={`${e.startTime}–${e.endTime} · ${e.class?.name ?? ""}`}
                />
              ))}
            </Panel>
          ) : null;
        })}
      </QueryState>
    </TeacherPage>
  );
}
