import { router, type Href, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  getTeaching,
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
import { formatCalendarDate } from "@/components/CalendarDateField";
import { Button } from "@/components/Button";
import { SearchBar } from "@/components/Fields";
import { StudentProfileCard } from "@/features/shared/StudentProfileCard";
import { HeroCard } from "@/components/HeroCard";
export { default as TeacherTimetable } from "./TimetableBrowser";
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
  ][new Date().getUTCDay()];
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
      </QueryState>
      <Panel title="Today's timetable">
        <QueryState query={timetable} empty={!lessons.length}>
          {lessons.map((e) => (
            <ListRow
              key={e.id}
              title={e.subject?.name ?? e.label ?? e.type}
              subtitle={[
                `${e.startTime}–${e.endTime}`,
                e.class?.name,
                e.classroom?.name,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
          ))}
        </QueryState>
        <LinkButton
          label="Weekly timetable"
          href={"/(teacher)/teacher-timetable" as Href}
        />
      </Panel>
      {teaching.data?.classes
        .filter((c) => c.isClassTeacher)
        .map((c) => (
          <ClassGaps key={c.id} id={c.id} name={c.name} />
        ))}
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
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const classes =
    teaching.data?.classes.filter((c) =>
      c.name.toLowerCase().includes(normalizedSearch),
    ) ?? [];
  return (
    <TeacherPage title="Classes" query={teaching}>
      <LinkButton
        label="Class directory"
        href="/(teacher)/teacher-class-directory"
      />
      <SearchBar label="Search classes" value={search} onChange={setSearch} />
      <QueryState query={teaching} empty={!classes.length}>
        {classes.map((c) => (
          <Panel key={c.id} title={c.name}>
            <Copy>
              {c.studentCount} pupils ·{" "}
              {c.isClassTeacher ? "Class teacher" : "Subject teacher"}
            </Copy>
            {c.subjects.map((subject) => (
              <LinkButton
                key={subject.id}
                label={`Enter ${subject.name} marks`}
                href={{
                  pathname: "/(teacher)/teacher-score-entry",
                  params: { classId: c.id, subjectId: subject.id },
                }}
              />
            ))}
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
  const [showDetails, setShowDetails] = useState(false);
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
        {p.data ? <StudentProfileCard student={p.data} /> : null}
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

function PupilRecords({
  student,
}: {
  student: Awaited<ReturnType<typeof getTeacherStudent>>;
}) {
  const { profile, health, guardians } = student;
  const date = (value?: string | null) =>
    value ? formatCalendarDate(value.slice(0, 10)) : undefined;
  const rows = [
    ["Date of birth", date(profile.dateOfBirth)],
    ["Gender", profile.gender],
    ["Nationality", profile.nationality],
    [
      "Address",
      [profile.residentialAddress, profile.city, profile.region]
        .filter(Boolean)
        .join(", "),
    ],
    ["Previous school", student.previousSchool],
    ["Admitted", date(student.admissionDate)],
    [
      "Emergency contact",
      [
        profile.emergencyContactName,
        profile.emergencyRelationship,
        profile.emergencyContactPhone,
      ]
        .filter(Boolean)
        .join(" · "),
    ],
  ];
  return (
    <>
      <Panel title="Personal details">
        {rows.map(([label, value]) => (
          <ListRow
            key={label}
            title={label!}
            subtitle={value || "Not recorded"}
          />
        ))}
      </Panel>
      <Panel title="Sign-in details">
        <ListRow
          title="Username"
          subtitle={
            student.username ?? student.admissionNumber ?? "Not generated"
          }
        />
        <ListRow
          title="Login email"
          subtitle={student.loginEmail ?? profile.email ?? "Not generated"}
        />
      </Panel>
      {health ? (
        <Panel title="Health">
          <ListRow
            title="Blood group"
            subtitle={health.bloodGroup ?? "Not recorded"}
          />
          <ListRow
            title="Allergies"
            subtitle={health.allergies ?? "Not recorded"}
          />
          <ListRow
            title="Medical conditions"
            subtitle={health.medicalConditions ?? "Not recorded"}
          />
        </Panel>
      ) : null}
      {guardians ? (
        <Panel title="Parents and guardians">
          {guardians.length ? (
            guardians.map((guardian) => (
              <ListRow
                key={guardian.id}
                title={guardian.name}
                subtitle={[
                  guardian.relationshipType,
                  guardian.isPrimary ? "Primary" : "",
                  guardian.phone,
                  guardian.email,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ))
          ) : (
            <Copy>No guardian linked yet.</Copy>
          )}
        </Panel>
      ) : null}
    </>
  );
}
