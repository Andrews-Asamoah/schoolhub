import { router } from "expo-router";
import { useDeferredValue, useState } from "react";
import {
  listTeacherClasses,
  listTeacherStudents,
  listTeacherSubjects,
} from "@/api/teacher-workspace";
import { getTeaching } from "@/api/teacher";
import { useInfiniteEndpointQuery } from "@/api/pagination";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { SearchBar } from "@/components/Fields";
import { ListRow } from "@/components/ListRow";
import { SelectField } from "@/components/SelectField";
import { outputTable } from "@/features/shared/exports";
import { sessionStore, useSession } from "@/lib/session";
import { canEnterRole } from "@/lib/permissions";
import { teacherKey, useTeacherQuery } from "./queries";
import { Copy, Panel, QueryState, TeacherPage } from "./ui";

const statuses = [
  ["", "All statuses"],
  ["ACTIVE", "Active"],
  ["SUSPENDED", "Suspended"],
  ["GRADUATED", "Graduated"],
  ["WITHDRAWN", "Withdrawn"],
  ["TRANSFERRED", "Transferred"],
  ["EXPELLED", "Expelled"],
  ["DECEASED", "Deceased"],
].map(([value, label]) => ({ value: value!, label: label! }));

export function TeacherStudents() {
  const session = useSession();
  const [search, setSearch] = useState("");
  const term = useDeferredValue(search.trim());
  const [classId, setClass] = useState("");
  const [status, setStatus] = useState("");
  const classes = useTeacherQuery(["overview"], (signal) =>
    getTeaching({ signal }),
  );
  const filters = {
    search: term || undefined,
    classId: classId || undefined,
    status: status || undefined,
  };
  const students = useInfiniteEndpointQuery({
    queryKey: teacherKey(
      session.subdomain,
      "student-directory",
      term,
      classId,
      status,
    ),
    endpoint: listTeacherStudents,
    enabled: canEnterRole(session, "teacher"),
    query: { ...filters, limit: 30 },
    getNextPage: ({ meta }) =>
      meta.page < meta.totalPages ? meta.page + 1 : undefined,
  });
  const rows = students.data?.pages.flatMap((result) => result.data) ?? [];

  return (
    <TeacherPage title="Students" back query={students}>
      <SearchBar
        label="Search name or admission number"
        value={search}
        onChange={setSearch}
      />
      <QueryState query={classes}>
        <SelectField
          label="Class"
          value={classId}
          onChange={setClass}
          options={[
            { value: "", label: "All assigned classes" },
            ...(classes.data?.classes.map((item) => ({
              value: item.id,
              label: item.name,
            })) ?? []),
          ]}
        />
      </QueryState>
      <SelectField
        label="Student status"
        options={statuses}
        value={status}
        onChange={setStatus}
      />
      {rows.length ? (
        <DirectoryExport
          title="Student directory"
          headers={["Name", "Admission number", "Class", "Status"]}
          load={async () => {
            const revision = sessionStore.getRevision();
            const all = new Map<string, (typeof rows)[number]>();
            let page = 1;
            let lastPage: number;
            do {
              if (sessionStore.getRevision() !== revision)
                throw new Error("The school session changed.");
              const result = await listTeacherStudents({
                query: { ...filters, page, limit: 100 },
              });
              lastPage = result.meta.totalPages;
              result.data.forEach((student) => all.set(student.id, student));
              page++;
            } while (page <= lastPage);
            return [...all.values()].map((student) => [
              studentName(student.profile),
              student.admissionNumber ?? "",
              student.class?.name ?? "",
              student.status,
            ]);
          }}
        />
      ) : null}
      <QueryState
        query={{ ...students, isError: students.isError && !rows.length }}
        empty={!rows.length}
      >
        {rows.map((row) => {
          const name = studentName(row.profile);
          return (
            <ListRow
              key={row.id}
              title={name}
              subtitle={[
                row.class?.name,
                row.admissionNumber,
                row.status.toLowerCase(),
              ]
                .filter(Boolean)
                .join(" · ")}
              leading={
                <Avatar
                  name={name}
                  uri={row.profile.user?.image}
                  cachePolicy="none"
                />
              }
              chevron
              divider
              onPress={() =>
                router.push({
                  pathname: "/(teacher)/teacher-pupil",
                  params: { studentId: row.id },
                })
              }
            />
          );
        })}
        {students.isFetchNextPageError ? (
          <Copy alert>Could not load more students.</Copy>
        ) : null}
        {students.hasNextPage ? (
          <Button
            label="Load more students"
            variant="secondary"
            loading={students.isFetchingNextPage}
            onPress={() => void students.fetchNextPage()}
          />
        ) : null}
      </QueryState>
    </TeacherPage>
  );
}

export function TeacherSubjects() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const q = useTeacherQuery(["subjects-catalogue"], (signal) =>
    listTeacherSubjects({ signal, query: { includeInactive: true } }),
  );
  const matches =
    q.data?.filter((row) =>
      `${row.name} ${row.code}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    ) ?? [];
  return (
    <TeacherPage title="Subjects" back query={q}>
      <SearchBar label="Search subjects" value={search} onChange={setSearch} />
      {matches.length ? (
        <DirectoryExport
          title="Subjects"
          headers={[
            "Name",
            "Code",
            "Periods per week",
            "Classes",
            "Qualified teachers",
            "Status",
          ]}
          load={async () =>
            matches.map((subject) => [
              subject.name,
              subject.code,
              subject.periodsPerWeek,
              subject.classes.map((row) => row.className).join(", "),
              subject.teachers.map((teacher) => teacher.name).join(", "),
              subject.isActive ? "Active" : "Inactive",
            ])
          }
        />
      ) : null}
      <QueryState query={q} empty={!matches.length}>
        {matches.map((row) => (
          <Panel key={row.id} title={row.name}>
            <Copy>
              {row.code} · {row.periodsPerWeek} periods per week
              {row.isActive ? "" : " · Inactive"}
            </Copy>
            <Button
              label={
                selected === row.id
                  ? "Hide subject details"
                  : "Show subject details"
              }
              variant="secondary"
              onPress={() => setSelected(selected === row.id ? null : row.id)}
            />
            {selected === row.id ? (
              <>
                {row.description ? <Copy>{row.description}</Copy> : null}
                <Copy heading>Class assignments</Copy>
                {row.classes.length ? (
                  row.classes.map((item) => (
                    <ListRow
                      key={item.classId}
                      title={item.className}
                      subtitle={item.teacherName ?? "No teacher assigned"}
                    />
                  ))
                ) : (
                  <Copy>No classes assigned.</Copy>
                )}
                <Copy heading>Qualified teachers</Copy>
                <Copy>
                  {row.teachers.map((teacher) => teacher.name).join(", ") ||
                    "None recorded"}
                </Copy>
                {row.strands.length ? (
                  <Copy heading>Teaching areas</Copy>
                ) : null}
                {row.strands.map((strand) => (
                  <ListRow
                    key={strand.id}
                    title={`${strand.name}${strand.isActive ? "" : " · Inactive"}`}
                    subtitle={
                      strand.assignments
                        .map(
                          (entry) =>
                            `${entry.className} · ${entry.teacherName ?? "Unassigned"}`,
                        )
                        .join("\n") || "No assignments"
                    }
                  />
                ))}
              </>
            ) : null}
          </Panel>
        ))}
      </QueryState>
    </TeacherPage>
  );
}

export function TeacherClassDirectory() {
  const [search, setSearch] = useState("");
  const q = useTeacherQuery(["class-directory"], (signal) =>
    listTeacherClasses({ signal }),
  );
  const rows =
    q.data?.filter((row) =>
      row.name.toLowerCase().includes(search.trim().toLowerCase()),
    ) ?? [];
  return (
    <TeacherPage title="Class directory" back query={q}>
      <SearchBar label="Search classes" value={search} onChange={setSearch} />
      {rows.length ? (
        <DirectoryExport
          title="Classes"
          headers={[
            "Class",
            "Level",
            "Department",
            "Pupils",
            "Capacity",
            "Class teacher",
            "Status",
          ]}
          load={async () =>
            rows.map((row) => [
              row.name,
              row.level,
              row.department?.name ?? "",
              row._count.students,
              row.capacity ?? "",
              classTeacherName(row.classTeacher),
              row.isActive ? "Active" : "Inactive",
            ])
          }
        />
      ) : null}
      <QueryState query={q} empty={!rows.length}>
        {rows.map((row) => {
          const teacherName = classTeacherName(row.classTeacher);
          return (
            <Panel key={row.id} title={row.name}>
              <Copy>
                {[
                  row.level,
                  row.department?.name,
                  row.isActive ? "Active" : "Inactive",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Copy>
              <Copy>
                {row._count.students}
                {row.capacity == null ? "" : ` / ${row.capacity}`} pupils
              </Copy>
              <Copy>
                {teacherName
                  ? `Class teacher · ${teacherName}`
                  : "No class teacher assigned"}
              </Copy>
              <Button
                label={`View ${row.name} roster`}
                variant="secondary"
                onPress={() =>
                  router.push({
                    pathname: "/(teacher)/teacher-roster",
                    params: { classId: row.id },
                  })
                }
              />
            </Panel>
          );
        })}
      </QueryState>
    </TeacherPage>
  );
}

function studentName(profile: {
  firstName: string;
  lastName: string;
  otherNames?: string | null;
}) {
  return [profile.firstName, profile.otherNames, profile.lastName]
    .filter(Boolean)
    .join(" ");
}

function classTeacherName(
  teacher: {
    firstName?: string | null;
    lastName?: string | null;
    profile?: { firstName: string; lastName: string } | null;
  } | null,
) {
  const profile = teacher?.profile ?? teacher;
  return [profile?.firstName, profile?.lastName].filter(Boolean).join(" ");
}

const exportFormats = [
  { value: "print", label: "Print" },
  { value: "pdf", label: "Share PDF" },
  { value: "xlsx", label: "Share Excel" },
] as const;

function DirectoryExport({
  title,
  headers,
  load,
}: {
  title: string;
  headers: string[];
  load: () => Promise<(string | number)[][]>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function exportRows(format: string) {
    if (format !== "print" && format !== "pdf" && format !== "xlsx") return;
    const revision = sessionStore.getRevision();
    setBusy(true);
    setError("");
    try {
      const rows = await load();
      if (sessionStore.getRevision() !== revision) return;
      await outputTable(title, headers, rows, format);
    } catch {
      if (sessionStore.getRevision() === revision)
        setError("Could not export the directory. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SelectField
        label={busy ? "Preparing export…" : "Export results"}
        value=""
        options={exportFormats}
        disabled={busy}
        onChange={(value) => void exportRows(value)}
      />
      {error ? <Copy alert>{error}</Copy> : null}
    </>
  );
}
