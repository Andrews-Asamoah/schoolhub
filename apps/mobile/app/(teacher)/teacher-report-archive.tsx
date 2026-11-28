import { useDeferredValue, useState } from "react";
import { Alert } from "react-native";
import {
  downloadTeacherArchiveReport,
  getTeacherArchive,
  getTeacherArchiveFilters,
} from "@/api/teacher";
import { TeacherPage, Panel, QueryState, Copy } from "@/features/teacher/ui";
import { useTeacherQuery } from "@/features/teacher/queries";
import { Button } from "@/components/Button";
import { SelectField } from "@/components/SelectField";
import { TextField } from "@/components/TextField";

const all = [{ value: "", label: "All" }];
const options = (items: { id: string; name: string }[]) => [
  ...all,
  ...items.map(({ id, name }) => ({ value: id, label: name })),
];

export default function TeacherReportArchive() {
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("");
  const [term, setTerm] = useState("");
  const [classId, setClass] = useState("");
  const [page, setPage] = useState(1);
  const [opening, setOpening] = useState(false);
  const q = useDeferredValue(search.trim());
  const filters = useTeacherQuery(["archive-filters"], (signal) =>
    getTeacherArchiveFilters({ signal }),
  );
  const result = useTeacherQuery(
    ["archive", q, year, term, classId, page],
    (signal) =>
      getTeacherArchive({
        signal,
        query: {
          q,
          academicYearId: year || undefined,
          termId: term || undefined,
          classId: classId || undefined,
          page,
        },
      }),
  );
  const years = filters.data?.years ?? [];

  return (
    <TeacherPage title="Published report archive" query={result} back>
      <Panel title="Filter reports">
        <TextField
          label="Find pupil or report"
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <QueryState query={filters}>
          <SelectField
            label="Academic year"
            value={year}
            options={options(years)}
            onChange={(value) => {
              setYear(value);
              setTerm("");
              setPage(1);
            }}
          />
          {year ? (
            <SelectField
              label="Term"
              value={term}
              options={options(
                years.find(({ id }) => id === year)?.terms ?? [],
              )}
              onChange={(value) => {
                setTerm(value);
                setPage(1);
              }}
            />
          ) : null}
          <SelectField
            label="Class when issued"
            value={classId}
            options={options(filters.data?.classes ?? [])}
            onChange={(value) => {
              setClass(value);
              setPage(1);
            }}
          />
        </QueryState>
      </Panel>
      <QueryState query={result} empty={!result.data?.items.length}>
        {result.data?.items.map((item) => (
          <Panel key={item.id} title={item.pupilName}>
            <Copy>
              {[item.setName, item.academicYear, item.term, item.className]
                .filter(Boolean)
                .join(" · ")}
            </Copy>
            {item.hasPdf ? (
              <Button
                label="Open signed report PDF"
                variant="secondary"
                disabled={opening}
                onPress={() => {
                  setOpening(true);
                  void downloadTeacherArchiveReport({
                    params: { reportId: item.id },
                  })
                    .catch(() => Alert.alert("Could not open the report PDF"))
                    .finally(() => setOpening(false));
                }}
              />
            ) : (
              <Copy>No signed PDF is available for this report.</Copy>
            )}
          </Panel>
        ))}
      </QueryState>
      {page > 1 ? (
        <Button
          label="Previous page"
          variant="secondary"
          onPress={() => setPage(page - 1)}
        />
      ) : null}
      {result.data && page * result.data.pageSize < result.data.total ? (
        <Button
          label="Next page"
          variant="secondary"
          onPress={() => setPage(page + 1)}
        />
      ) : null}
    </TeacherPage>
  );
}
