import { useState } from "react";
import { getTeacherTimetable } from "@/api/teacher";
import {
  getSchoolTimetable,
  listTeacherTimetableOptions,
} from "@/api/teacher-workspace";
import { SelectField } from "@/components/SelectField";
import { Timetable } from "@/features/shared/Timetable";
import { useTeacherQuery } from "./queries";
import { QueryState, TeacherPage } from "./ui";

const perspectives = [
  { value: "mine", label: "My timetable" },
  { value: "class", label: "Class" },
  { value: "teacher", label: "Teacher" },
  { value: "room", label: "Room" },
];

export default function TimetableBrowser() {
  const [year, setYear] = useState("");
  const [view, setView] = useState("mine");
  const [target, setTarget] = useState("");
  const setup = useTeacherQuery(["timetable-options", year], (signal) =>
    listTeacherTimetableOptions({
      signal,
      query: { academicYearId: year || undefined },
    }),
  );
  const options =
    view === "class"
      ? setup.data?.classes
      : view === "teacher"
        ? setup.data?.teachers
        : setup.data?.classrooms;
  const selection = options?.find((item) => item.id === target) ?? options?.[0];
  const yearId = setup.data?.academicYear?.id;
  const personal = view === "mine";
  const q = useTeacherQuery(
    personal && !year
      ? ["timetable"]
      : ["timetable-browser", yearId, view, selection?.id],
    (signal) =>
      personal
        ? getTeacherTimetable({
            signal,
            query: { academicYearId: year || undefined },
          })
        : getSchoolTimetable({
            signal,
            query: { view, id: selection?.id, academicYearId: yearId },
          }),
    personal || !!(selection && yearId),
  );

  return (
    <TeacherPage title="Weekly timetable" back query={q}>
      <QueryState query={setup}>
        <SelectField
          label="Academic year"
          value={yearId ?? ""}
          options={(setup.data?.academicYears ?? []).map((item) => ({
            value: item.id,
            label: item.name,
          }))}
          onChange={(value) => {
            setYear(value);
            setTarget("");
          }}
        />
        <SelectField
          label="View by"
          value={view}
          options={perspectives}
          onChange={(value) => {
            setView(value);
            setTarget("");
          }}
        />
        {!personal ? (
          <SelectField
            label={
              perspectives.find((option) => option.value === view)?.label ??
              "Timetable"
            }
            value={selection?.id ?? ""}
            options={(options ?? []).map((item) => ({
              value: item.id,
              label: item.name,
            }))}
            onChange={setTarget}
          />
        ) : null}
        <QueryState
          query={personal || selection ? q : { ...q, isPending: false }}
          empty={!q.data?.entries.length}
        >
          <Timetable
            key={`${yearId}:${view}:${selection?.id}`}
            entries={q.data?.entries ?? []}
            title={
              personal
                ? "Teaching timetable"
                : `${selection?.name ?? ""} weekly timetable`
            }
            showClass={view !== "class"}
            showExcel
            showCurrent={personal && !year}
          />
        </QueryState>
      </QueryState>
    </TeacherPage>
  );
}
