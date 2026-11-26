import { useState } from "react";
import { SelectField } from "@/components/SelectField";
import { ReportPreview } from "@/features/shared/ReportPreview";
import { Alert, View } from "react-native";
import { ClipboardList, Download } from "lucide-react-native";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SkeletonRow } from "@/components/Skeleton";
import { Text } from "@/components/Typography";
import { GuardianBackButton } from "@/features/guardian/BackButton";
import { downloadGuardianReport } from "@/api/guardian";
import { useGuardian } from "@/features/guardian/context";
import { WardSwitcher } from "@/features/guardian/WardSwitcher";
import { useGuardianReportsQuery } from "@/features/guardian/queries";
import { spacing, type, useTheme } from "@/theme/theme";

async function download(action: () => Promise<void>, title: string) {
  try {
    await action();
  } catch (error) {
    Alert.alert(
      `${title} download failed`,
      error instanceof Error
        ? error.message
        : "The PDF could not be downloaded.",
    );
  }
}

export default function GuardianReportsScreen() {
  const { activeWard } = useGuardian();
  const reports = useGuardianReportsQuery();
  const { colors } = useTheme();
  const wardId = activeWard?.id;
  const [selection, setSelection] = useState<{
    wardId: string | undefined;
    year: string;
    term: string;
    reportId: string;
  }>();
  const [previousWard, setPreviousWard] = useState(wardId);
  if (previousWard !== wardId) {
    setPreviousWard(wardId);
    setSelection(undefined);
  }
  const active = selection?.wardId === wardId ? selection : undefined;
  const year = active?.year ?? "";
  const term = active?.term ?? "";
  const wardReports =
    reports.data?.filter((report) => report.studentId === wardId) ?? [];
  const yearRows = wardReports.filter(
    (report) => !year || report.set.academicYear.name === year,
  );
  const visible = yearRows.filter(
    (report) => !term || report.set.term.name === term,
  );
  const selected = visible.find((report) => report.id === active?.reportId);
  const options = (values: string[], label: string) => [
    { value: "", label },
    ...[...new Set(values)].map((value) => ({ value, label: value })),
  ];
  const loading = reports.isPending;
  const failed = reports.isError;
  const retry = () => {
    void reports.refetch();
  };
  return (
    <Screen
      title="Reports"
      subtitle={activeWard?.profile.firstName ?? "Published academic reports"}
      left={<GuardianBackButton />}
      right={<WardSwitcher />}
      refreshing={reports.isRefetching}
      onRefresh={retry}
    >
      <View style={{ gap: spacing.lg }}>
        {!activeWard ? (
          <EmptyState
            title="No child selected"
            message="Link a child to view published reports."
            hue="indigo"
          />
        ) : loading ? (
          <Card>
            <SkeletonRow />
            <SkeletonRow />
          </Card>
        ) : failed ? (
          <ErrorState
            title="Unable to load reports"
            message="One or more report lists could not be loaded."
            actionLabel="Retry"
            onAction={retry}
            hue="indigo"
          />
        ) : !wardReports.length ? (
          <EmptyState
            title="No published reports yet"
            message="Published report cards, including mock results, will appear here."
            icon={<ClipboardList size={32} color={colors.mutedForeground} />}
            hue="indigo"
          />
        ) : (
          <>
            <SelectField
              label="Academic year"
              value={year}
              options={options(
                wardReports.map((report) => report.set.academicYear.name),
                "All years",
              )}
              onChange={(year) =>
                setSelection({ wardId, year, term: "", reportId: "" })
              }
            />
            <SelectField
              label="Term"
              value={term}
              options={options(
                yearRows.map((report) => report.set.term.name),
                "All terms",
              )}
              onChange={(term) =>
                setSelection({ wardId, year, term, reportId: "" })
              }
            />
            <Card>
              <Text
                style={[
                  type.headline,
                  { color: colors.foreground, marginBottom: spacing.sm },
                ]}
              >
                Academic reports
              </Text>
              {visible.map((report, index, entries) => (
                <ListRow
                  key={report.id}
                  title={report.set.name}
                  subtitle={`${report.set.academicYear.name} · ${report.set.term.name}`}
                  leading={<ClipboardList size={20} color={colors.primary} />}
                  trailing={
                    report.pdfAvailable ? (
                      <Download size={18} color={colors.primary} />
                    ) : undefined
                  }
                  status={report.pdfAvailable ? "PDF" : "Published"}
                  divider={index < entries.length - 1}
                  onPress={() =>
                    setSelection({ wardId, year, term, reportId: report.id })
                  }
                  hue="indigo"
                />
              ))}
              {visible.length === 0 ? (
                <Text style={[type.body, { color: colors.mutedForeground }]}>
                  No reports match the selected term.
                </Text>
              ) : null}
            </Card>
            {selected ? (
              <ReportPreview
                printable={!selected.pdfAvailable}
                title={selected.set.name}
                data={selected.data}
                approval={selected.approval}
                onShare={
                  selected.pdfAvailable
                    ? () =>
                        void download(
                          () => downloadGuardianReport(selected.id),
                          "Report",
                        )
                    : undefined
                }
              />
            ) : null}
            <Text style={[type.caption, { color: colors.mutedForeground }]}>
              Only reports published for guardian viewing are listed. Downloads
              are shared securely from this device.
            </Text>
          </>
        )}
      </View>
    </Screen>
  );
}
