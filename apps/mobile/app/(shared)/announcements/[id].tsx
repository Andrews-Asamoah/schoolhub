import { useLocalSearchParams } from "expo-router";
import { Megaphone } from "lucide-react-native";
import { View } from "react-native";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { Screen } from "@/components/Screen";
import { SkeletonHero } from "@/components/Skeleton";
import { Text } from "@/components/Typography";
import { useAnnouncementsQuery } from "@/features/announcements/queries";
import { formatDateTime } from "@/features/shared/format";
import { spacing, type, useTheme } from "@/theme/theme";

export default function AnnouncementDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useAnnouncementsQuery();
  const announcement = query.data?.find((item) => item.id === id);
  const { colors } = useTheme();

  return (
    <Screen
      title="Announcement"
      subtitle="School notice"
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      {query.isPending ? (
        <SkeletonHero />
      ) : query.isError ? (
        <ErrorState
          title="Unable to load this announcement"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void query.refetch()}
          hue="amber"
        />
      ) : !announcement ? (
        <EmptyState
          title="Announcement unavailable"
          message="It may have been removed or is no longer published."
          icon={<Megaphone size={32} color={colors.mutedForeground} />}
          hue="amber"
        />
      ) : (
        <Card padding={spacing.xl}>
          <View style={{ gap: spacing.md }}>
            <Text
              accessibilityRole="header"
              style={[type.title, { color: colors.foreground }]}
            >
              {announcement.title}
            </Text>
            <Text style={[type.caption, { color: colors.mutedForeground }]}>
              {announcement.category} · {formatDateTime(announcement.createdAt)}
            </Text>
            <Text style={[type.body, { color: colors.foreground }]}>
              {announcement.content}
            </Text>
          </View>
        </Card>
      )}
    </Screen>
  );
}
