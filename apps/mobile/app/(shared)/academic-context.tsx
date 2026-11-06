import { CalendarDays } from "lucide-react-native";
import { View } from "react-native";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { Screen } from "@/components/Screen";
import { SkeletonRow } from "@/components/Skeleton";
import { Text } from "@/components/Typography";
import { formatDateTime } from "@/features/shared/format";
import { useAcademicContextQuery } from "@/features/shared/queries";
import { spacing, type, useTheme } from "@/theme/theme";

export default function AcademicContextScreen() {
  const query = useAcademicContextQuery();
  const { colors } = useTheme();
  return (
    <Screen
      title="Academic calendar"
      subtitle="Your school's current term"
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      {query.isPending ? (
        <Card>
          <SkeletonRow />
          <SkeletonRow />
        </Card>
      ) : query.isError ? (
        <ErrorState
          title="Unable to load the academic calendar"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void query.refetch()}
        />
      ) : !query.data ? (
        <EmptyState
          title="No current term is set"
          message="Your school administrator has not selected the active academic term."
          icon={<CalendarDays size={32} color={colors.mutedForeground} />}
          hue="violet"
        />
      ) : (
        <Card padding={spacing.xl}>
          <View style={{ gap: spacing.md }}>
            <CalendarDays size={28} color={colors.primary} />
            <Text style={[type.title, { color: colors.foreground }]}>
              {query.data.term.name}
            </Text>
            <Text style={[type.body, { color: colors.mutedForeground }]}>
              {query.data.academicYear.name ?? "Current academic year"}
            </Text>
            {query.data.term.startDate && query.data.term.endDate ? (
              <Text style={[type.caption, { color: colors.mutedForeground }]}>
                {formatDateTime(query.data.term.startDate)} –{" "}
                {formatDateTime(query.data.term.endDate)}
              </Text>
            ) : null}
          </View>
        </Card>
      )}
    </Screen>
  );
}
