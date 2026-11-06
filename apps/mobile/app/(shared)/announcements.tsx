import { router, type Href } from "expo-router";
import { Megaphone } from "lucide-react-native";
import { View } from "react-native";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SkeletonRow } from "@/components/Skeleton";
import { useAnnouncementsQuery } from "@/features/announcements/queries";
import { formatDateTime } from "@/features/shared/format";
import { spacing, useTheme } from "@/theme/theme";

export default function AnnouncementsScreen() {
  const query = useAnnouncementsQuery();
  const { colors } = useTheme();
  const announcements =
    query.data?.filter((item) => item.status === "PUBLISHED") ?? [];

  return (
    <Screen
      title="Announcements"
      subtitle="Notices from your school community"
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
            title="Unable to load announcements"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => void query.refetch()}
            hue="amber"
          />
        ) : announcements.length === 0 ? (
          <EmptyState
            title="No announcements yet"
            message="Published school notices will appear here."
            icon={<Megaphone size={32} color={colors.mutedForeground} />}
            hue="amber"
          />
        ) : (
          <Card>
            {announcements.map((item, index) => (
              <ListRow
                key={item.id}
                title={item.title}
                subtitle={`${item.category} · ${formatDateTime(item.createdAt)}`}
                leading={<Megaphone size={20} color={colors.primary} />}
                status={item.isPinned ? "Pinned" : undefined}
                hue="amber"
                divider={index < announcements.length - 1}
                onPress={() =>
                  router.push(
                    `/(shared)/announcements/${encodeURIComponent(item.id)}` as Href,
                  )
                }
              />
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}
