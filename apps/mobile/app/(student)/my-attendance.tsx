import { CalendarDays } from "lucide-react-native";
import { View } from "react-native";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { ListRow } from "@/components/ListRow";
import { ProgressRing } from "@/components/Charts";
import { Screen } from "@/components/Screen";
import { SkeletonRow } from "@/components/Skeleton";
import { Text } from "@/components/Typography";
import { useMyAttendanceQuery } from "@/features/student/queries";
import { spacing, type, useTheme } from "@/theme/theme";

export default function StudentAttendanceScreen() {
  const query = useMyAttendanceQuery();
  const { colors } = useTheme();
  return (
    <Screen
      title="Attendance"
      subtitle={
        query.data?.term?.name
          ? `${query.data.term.name} · ${query.data.academicYear.name}`
          : "Your term summary"
      }
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <View style={{ gap: spacing.lg }}>
        {query.isPending ? (
          <Card>
            <SkeletonRow />
            <SkeletonRow />
          </Card>
        ) : query.isError ? (
          <ErrorState
            title="Unable to load attendance"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => void query.refetch()}
            hue="emerald"
          />
        ) : !query.data || query.data.totalDays === 0 ? (
          <EmptyState
            title="No attendance records yet"
            message="Attendance for the current term will appear here."
            icon={<CalendarDays size={32} color={colors.mutedForeground} />}
            hue="emerald"
          />
        ) : (
          <>
            <Card>
              <View style={{ alignItems: "center", gap: spacing.md }}>
                {query.data.attendanceRate === null ? (
                  <Text
                    style={[
                      type.bodyStrong,
                      { color: colors.mutedForeground, textAlign: "center" },
                    ]}
                  >
                    Attendance rate is unavailable for this period.
                  </Text>
                ) : (
                  <ProgressRing
                    label="Attendance"
                    value={query.data.attendanceRate}
                    hue="emerald"
                  />
                )}
                <Text
                  style={[
                    type.body,
                    { color: colors.mutedForeground, textAlign: "center" },
                  ]}
                >
                  {query.data.recordedDays} recorded{" "}
                  {query.data.recordedDays === 1 ? "day" : "days"} this term
                </Text>
                {!query.data.isComplete ? (
                  <Text
                    style={[
                      type.caption,
                      { color: colors.mutedForeground, textAlign: "center" },
                    ]}
                  >
                    This summary may change as attendance is completed.
                  </Text>
                ) : null}
              </View>
            </Card>
            {query.data.missingDates.length ? (
              <Card>
                <Text
                  style={[
                    type.headline,
                    { color: colors.foreground, marginBottom: spacing.sm },
                  ]}
                >
                  Unrecorded days
                </Text>
                <Text style={[type.body, { color: colors.mutedForeground }]}>
                  {query.data.missingDates
                    .map((date) => new Date(date).toLocaleDateString())
                    .join(" · ")}
                </Text>
              </Card>
            ) : null}
            <Card>
              <Text
                style={[
                  type.headline,
                  { color: colors.foreground, marginBottom: spacing.sm },
                ]}
              >
                Summary
              </Text>
              {Object.entries(query.data.summary).map(
                ([status, count], index, entries) => (
                  <ListRow
                    key={status}
                    title={status.replaceAll("_", " ")}
                    trailing={
                      <Text
                        style={[type.bodyStrong, { color: colors.foreground }]}
                      >
                        {count}
                      </Text>
                    }
                    divider={index < entries.length - 1}
                  />
                ),
              )}
            </Card>
            <Card>
              <Text
                style={[
                  type.headline,
                  { color: colors.foreground, marginBottom: spacing.sm },
                ]}
              >
                Recent records
              </Text>
              {query.data.recentRecords.length ? (
                query.data.recentRecords.map((record, index, entries) => (
                  <ListRow
                    key={record.id}
                    title={record.status.replaceAll("_", " ")}
                    subtitle={`${new Date(record.date).toLocaleDateString()}${record.remarks ? ` · ${record.remarks}` : ""}`}
                    leading={<CalendarDays size={18} color={colors.primary} />}
                    divider={index < entries.length - 1}
                  />
                ))
              ) : (
                <Text style={[type.body, { color: colors.mutedForeground }]}>
                  No recent attendance entries.
                </Text>
              )}
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}
