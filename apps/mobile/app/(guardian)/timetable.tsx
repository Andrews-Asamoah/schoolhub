import { Timetable } from "@/features/shared/Timetable";
import { BookOpen } from "lucide-react-native";
import { View } from "react-native";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { Screen } from "@/components/Screen";
import { SkeletonRow } from "@/components/Skeleton";
import { GuardianBackButton } from "@/features/guardian/BackButton";
import { useGuardian } from "@/features/guardian/context";
import { WardSwitcher } from "@/features/guardian/WardSwitcher";
import { useWardTimetableQuery } from "@/features/guardian/queries";
import { spacing, useTheme } from "@/theme/theme";

export default function GuardianTimetableScreen() {
  const { activeWard } = useGuardian();
  const query = useWardTimetableQuery(activeWard?.id ?? "");
  const { colors } = useTheme();
  return (
    <Screen
      title="Timetable"
      subtitle={
        query.data?.class?.name ??
        activeWard?.profile.firstName ??
        "Weekly schedule"
      }
      left={<GuardianBackButton />}
      right={<WardSwitcher />}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <View style={{ gap: spacing.lg }}>
        {!activeWard ? (
          <EmptyState
            title="No child selected"
            message="Link a child to view their timetable."
            hue="violet"
          />
        ) : query.isPending ? (
          <Card>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </Card>
        ) : query.isError ? (
          <ErrorState
            title="Unable to load timetable"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => void query.refetch()}
            hue="violet"
          />
        ) : query.data.entries.length === 0 ? (
          <EmptyState
            title="No timetable available"
            message="A class schedule will appear here when one is available."
            icon={<BookOpen size={32} color={colors.mutedForeground} />}
            hue="violet"
          />
        ) : (
          <Timetable
            key={activeWard.id}
            entries={query.data.entries}
            title={`${query.data.class?.name ?? "Class"} weekly timetable`}
            period={[query.data.academicYear?.name, query.data.term?.name]
              .filter(Boolean)
              .join(" · ")}
          />
        )}
      </View>
    </Screen>
  );
}
