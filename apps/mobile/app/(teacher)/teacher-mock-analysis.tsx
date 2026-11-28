import { useState } from "react";
import { getTeacherMockAnalysis, getTeacherMockOptions } from "@/api/teacher";
import { SelectField } from "@/components/SelectField";
import { TeacherPage, QueryState, Panel, Copy } from "@/features/teacher/ui";
import { useTeacherQuery } from "@/features/teacher/queries";

function percentage(value: number | null) {
  return value == null ? "No result" : `${value.toFixed(1)}%`;
}

export default function TeacherMockAnalysis() {
  const [yearId, setYear] = useState("");
  const [classId, setClass] = useState("");
  const settings = useTeacherQuery(["mock-options"], (signal) =>
    getTeacherMockOptions({ signal }),
  );
  const query = useTeacherQuery(
    ["mock-analysis", yearId, classId],
    (signal) =>
      getTeacherMockAnalysis({
        signal,
        query: { academicYearId: yearId, classId },
      }),
    !!yearId && !!classId,
  );
  const data = query.data;

  return (
    <TeacherPage
      title="Internal mock analysis"
      back
      query={yearId && classId ? query : settings}
    >
      <Panel title="Choose a class">
        <QueryState query={settings}>
          <SelectField
            label="Academic year"
            value={yearId}
            options={(settings.data?.years ?? []).map(({ id, name }) => ({
              value: id,
              label: name,
            }))}
            onChange={(value) => {
              setYear(value);
              setClass("");
            }}
          />
          <SelectField
            label="Class"
            value={classId}
            disabled={!yearId}
            options={(settings.data?.classes ?? [])
              .filter(({ yearIds }) => yearIds.includes(yearId))
              .map(({ id, name }) => ({ value: id, label: name }))}
            onChange={setClass}
          />
        </QueryState>
      </Panel>
      {yearId && classId ? (
        <QueryState query={query} empty={!data?.mocks.length}>
          {data?.subjectsLimited ? (
            <Copy>Analysis includes the subjects you teach.</Copy>
          ) : null}
          {data?.mocks.map((mock) => (
            <Panel key={mock.id} title={mock.name}>
              <Copy>
                {percentage(mock.classAverage)} average · {mock.sat} sat ·{" "}
                {mock.atRisk} at risk
              </Copy>
            </Panel>
          ))}
          {data?.subjects.map((subject) => (
            <Panel key={subject.subjectId} title={subject.name}>
              {subject.points.map((point) => (
                <Copy key={point.mockId}>
                  {data.mocks.find(({ id }) => id === point.mockId)?.name}:{" "}
                  {percentage(point.average)}
                </Copy>
              ))}
            </Panel>
          ))}
          {data?.students.map((student) => (
            <Panel key={student.id} title={student.name}>
              <Copy>
                {percentage(student.latestAverage)} ·{" "}
                {student.status?.toLowerCase().replaceAll("_", " ") ??
                  "No status"}{" "}
                · {student.trend.toLowerCase()}
              </Copy>
              {student.series.map((point) => (
                <Copy key={point.mockId}>
                  {data.mocks.find(({ id }) => id === point.mockId)?.name}:{" "}
                  {percentage(point.average)}
                </Copy>
              ))}
            </Panel>
          ))}
        </QueryState>
      ) : null}
    </TeacherPage>
  );
}
