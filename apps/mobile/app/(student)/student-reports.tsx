import { Alert, View } from "react-native";
import { ClipboardList, Download } from "lucide-react-native";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SkeletonRow } from "@/components/Skeleton";
import { Text } from "@/components/Typography";
import { downloadMyMock, downloadMyReport } from "@/api/student";
import {
  useMyAssessmentReportQuery,
  useMyPublishedMocksQuery,
  useMyPublishedReportsQuery,
} from "@/features/student/queries";
import { StudentBackButton } from "@/features/student/BackButton";
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

export default function StudentReportsScreen() {
  const assessment = useMyAssessmentReportQuery();
  const reports = useMyPublishedReportsQuery();
  const mocks = useMyPublishedMocksQuery();
  const { colors } = useTheme();
  const retry = () => {
    void Promise.all([
      assessment.refetch(),
      reports.refetch(),
      mocks.refetch(),
    ]);
  };
  const hasPublishedReports =
    (reports.data?.length ?? 0) + (mocks.data?.length ?? 0) > 0;

  return (
    <Screen
      title="Reports"
      subtitle="Assessment progress and published results"
      left={<StudentBackButton />}
      refreshing={
        assessment.isRefetching || reports.isRefetching || mocks.isRefetching
      }
      onRefresh={retry}
    >
      <View style={{ gap: spacing.lg }}>
        <Card>
          <Text
            accessibilityRole="header"
            style={[
              type.headline,
              { color: colors.foreground, marginBottom: spacing.sm },
            ]}
          >
            Current assessment
          </Text>
          {assessment.isPending ? (
            <SkeletonRow />
          ) : assessment.isError ? (
            <ErrorState
              title="Assessment report unavailable"
              message="The current term report could not be loaded."
              actionLabel="Retry"
              onAction={() => void assessment.refetch()}
              hue="indigo"
            />
          ) : assessment.data?.scores.length ? (
            <>
              <Text
                style={[
                  type.caption,
                  { color: colors.mutedForeground, marginBottom: spacing.sm },
                ]}
              >
                {assessment.data.class.name} ·{" "}
                {assessment.data.academicYear.name}
              </Text>
              {assessment.data.scores.map((score, index, entries) => (
                <View key={score.id}>
                  <ListRow
                    title={score.subject.name}
                    subtitle={
                      score.percentage === null
                        ? "No score recorded"
                        : `${Math.round(score.percentage)}%${score.totalScore === null ? "" : ` · ${score.totalScore} marks`}`
                    }
                    status={
                      score.componentScores.length
                        ? `${score.componentScores.length} assessment${score.componentScores.length === 1 ? "" : "s"}`
                        : undefined
                    }
                    divider={index < entries.length - 1}
                  />
                </View>
              ))}
            </>
          ) : (
            <EmptyState
              title="No assessment scores yet"
              message="Your current term assessment results will appear here."
              hue="indigo"
            />
          )}
        </Card>

        <Card>
          <Text
            accessibilityRole="header"
            style={[
              type.headline,
              { color: colors.foreground, marginBottom: spacing.sm },
            ]}
          >
            Published academic reports
          </Text>
          {reports.isPending ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : reports.isError ? (
            <ErrorState
              title="Published reports unavailable"
              message="The report list could not be loaded."
              actionLabel="Retry"
              onAction={() => void reports.refetch()}
              hue="indigo"
            />
          ) : reports.data?.length ? (
            reports.data.map((report, index, entries) => (
              <ListRow
                key={report.id}
                title={report.set.name}
                subtitle={`${report.set.academicYear.name} · ${report.set.term.name} · ${new Date(report.publishedAt).toLocaleDateString()}`}
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
                          () =>
                            downloadMyReport({
                              params: { reportId: report.id },
                            }),
                          "Report",
                        )
                    : undefined
                }
                hue="indigo"
              />
            ))
          ) : (
            <Text style={[type.body, { color: colors.mutedForeground }]}>
              No published academic reports yet.
            </Text>
          )}
        </Card>

        <Card>
          <Text
            accessibilityRole="header"
            style={[
              type.headline,
              { color: colors.foreground, marginBottom: spacing.sm },
            ]}
          >
            Published internal mock results
          </Text>
          {mocks.isPending ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : mocks.isError ? (
            <ErrorState
              title="Mock results unavailable"
              message="The report list could not be loaded."
              actionLabel="Retry"
              onAction={() => void mocks.refetch()}
              hue="violet"
            />
          ) : mocks.data?.length ? (
            mocks.data.map((report, index, entries) => (
              <ListRow
                key={report.id}
                title={report.snapshot.name}
                subtitle={`${report.snapshot.year} · ${report.snapshot.term}${report.snapshot.average === null ? "" : ` · ${report.snapshot.average}% average`}`}
                leading={<ClipboardList size={20} color={colors.primary} />}
                trailing={<Download size={18} color={colors.primary} />}
                status="PDF"
                divider={index < entries.length - 1}
                onPress={() =>
                  void download(
                    () => downloadMyMock({ params: { id: report.id } }),
                    "Mock report",
                  )
                }
                hue="violet"
              />
            ))
          ) : (
            <Text style={[type.body, { color: colors.mutedForeground }]}>
              No published internal mock results yet.
            </Text>
          )}
        </Card>
        {!hasPublishedReports && !reports.isPending && !mocks.isPending ? (
          <Text style={[type.caption, { color: colors.mutedForeground }]}>
            Only results published for student viewing are listed. Downloads are
            shared securely from this device.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
