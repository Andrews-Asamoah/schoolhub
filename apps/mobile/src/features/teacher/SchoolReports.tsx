import { formatDateTime } from "@/features/shared/format";
import { useState } from "react";
import { getTeacherSchoolReport } from "@/api/teacher-workspace";
import { BarChart, DonutChart } from "@/components/Charts";
import { SelectField } from "@/components/SelectField";
import { useTeacherQuery } from "./queries";
import { Copy, Panel, QueryState, TeacherPage } from "./ui";

const periods = [3, 6, 12].map((months) => ({
  value: String(months),
  label: `Last ${months} months`,
}));

export default function TeacherSchoolReports() {
  const [months, setMonths] = useState("6");
  const q = useTeacherQuery(["school-report", months], (signal) =>
    getTeacherSchoolReport({ signal, query: { months } }),
  );
  return (
    <TeacherPage title="School reports" back query={q}>
      <SelectField
        label="Reporting period"
        options={periods}
        value={months}
        onChange={setMonths}
      />
      <QueryState query={q}>
        {q.data ? (
          <>
            <Panel title="Current school totals">
              <Copy>{q.data.metrics.activeStudents} active students</Copy>
              <Copy>{q.data.metrics.activeTeachers} active teachers</Copy>
              <Copy>
                {q.data.metrics.newAdmissionsThisMonth} admissions this month
              </Copy>
            </Panel>
            <Panel title="Enrollment growth">
              <BarChart
                label="Enrolled students by month"
                data={q.data.enrollmentGrowth.map((point) => ({
                  label: point.month,
                  value: point.population,
                }))}
              />
            </Panel>
            <Panel title="New admissions">
              <BarChart
                label="Admissions by month"
                data={q.data.enrollmentGrowth.map((point) => ({
                  label: point.month,
                  value: point.newAdmissions,
                  hue: "teal",
                }))}
              />
            </Panel>
            <Panel title="Gender distribution">
              <DonutChart
                label="Students by gender"
                data={q.data.genderDistribution.map((point, index) => ({
                  ...point,
                  hue: index % 2 ? "violet" : "teal",
                }))}
              />
            </Panel>
            <Copy>Generated {formatDateTime(q.data.generatedAt)}</Copy>
          </>
        ) : null}
      </QueryState>
    </TeacherPage>
  );
}
