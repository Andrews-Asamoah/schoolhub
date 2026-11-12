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
import {
  useGuardianReportsQuery,
} from "@/features/guardian/queries";
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
  const hasData = (reports.data?.length ?? 0) > 0;
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
        ) : !hasData ? (
          <EmptyState
            title="No published reports yet"
            message="Published report cards, including mock results, will appear here."
            icon={<ClipboardList size={32} color={colors.mutedForeground} />}
            hue="indigo"
          />
        ) : (
          <>
            <Card>
              <Text
                style={[
                  type.headline,
                  { color: colors.foreground, marginBottom: spacing.sm },
                ]}
              >
                Academic reports
              </Text>
              {(reports.data ?? [])
                .filter((report) => report.studentId === activeWard.id)
                .map((report, index, entries) => (
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
                    onPress={
                      report.pdfAvailable
                        ? () =>
                            void download(
                              () => downloadGuardianReport(report.id),
                              "Report",
                            )
                        : undefined
                    }
                    hue="indigo"
                  />
                ))}
              {(reports.data ?? []).filter(
                (report) => report.studentId === activeWard.id,
              ).length === 0 ? (
                <Text style={[type.body, { color: colors.mutedForeground }]}>
                  No published academic reports for this child.
                </Text>
              ) : null}
            </Card>
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
