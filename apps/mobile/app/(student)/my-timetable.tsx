import { CalendarDays } from "lucide-react-native";
import { View } from "react-native";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SkeletonRow } from "@/components/Skeleton";
import { Text } from "@/components/Typography";
import { useMyTimetableQuery } from "@/features/student/queries";
import { spacing, type, useTheme } from "@/theme/theme";

const week = [
  ["MONDAY", "Monday"],
  ["TUESDAY", "Tuesday"],
  ["WEDNESDAY", "Wednesday"],
  ["THURSDAY", "Thursday"],
  ["FRIDAY", "Friday"],
  ["SATURDAY", "Saturday"],
  ["SUNDAY", "Sunday"],
];

export default function StudentTimetableScreen() {
  const query = useMyTimetableQuery();
  const { colors } = useTheme();
  return (
    <Screen
      title="Timetable"
      subtitle={query.data?.class?.name ?? "Your weekly schedule"}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <View style={{ gap: spacing.lg }}>
        {query.isPending ? (
          <Card>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </Card>
        ) : query.isError ? (
          <ErrorState
            title="Unable to load your timetable"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => void query.refetch()}
            hue="violet"
          />
        ) : !query.data.entries.length ? (
          <EmptyState
            title="No timetable available"
            message="Your class schedule will appear here when the school publishes it."
            icon={<CalendarDays size={32} color={colors.mutedForeground} />}
            hue="violet"
          />
        ) : (
          <>
            {query.data.academicYear || query.data.term ? (
              <Text style={[type.caption, { color: colors.mutedForeground }]}>
                {[query.data.academicYear?.name, query.data.term?.name]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            ) : null}
            {week.map(([key, label]) => {
              const entries = query.data.entries
                .filter((entry) => entry.dayOfWeek.toUpperCase() === key)
                .sort((a, b) => a.startTime.localeCompare(b.startTime));
              if (!entries.length) return null;
              return (
                <Card key={key}>
                  <Text
                    accessibilityRole="header"
                    style={[
                      type.headline,
                      { color: colors.foreground, marginBottom: spacing.sm },
                    ]}
                  >
                    {label}
                  </Text>
                  {entries.map((entry, index) => (
                    <ListRow
                      key={entry.id}
                      title={entry.subject?.name ?? entry.label}
                      subtitle={`${entry.startTime}–${entry.endTime}${entry.classroom?.name ? ` · ${entry.classroom.name}` : ""}`}
                      leading={
                        <CalendarDays size={18} color={colors.primary} />
                      }
                      trailing={
                        entry.teacher?.name ? (
                          <Text
                            style={[
                              type.caption,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            {entry.teacher.name}
                          </Text>
                        ) : undefined
                      }
                      divider={index < entries.length - 1}
                    />
                  ))}
                </Card>
              );
            })}
          </>
        )}
      </View>
    </Screen>
  );
}
