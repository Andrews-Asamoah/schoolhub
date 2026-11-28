import { Timetable } from "@/features/shared/Timetable";
import { CalendarDays } from "lucide-react-native";
import { View } from "react-native";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { Screen } from "@/components/Screen";
import { SkeletonRow } from "@/components/Skeleton";
import { useMyTimetableQuery } from "@/features/student/queries";
import { spacing, useTheme } from "@/theme/theme";

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
          <Timetable
            entries={query.data.entries}
            title={`${query.data.class?.name ?? "Class"} weekly timetable`}
            period={[query.data.academicYear?.name, query.data.term?.name]
              .filter(Boolean)
              .join(" · ")}
            showCurrent
          />
        )}
      </View>
    </Screen>
  );
}
