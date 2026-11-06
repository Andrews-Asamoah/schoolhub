import { router, type Href } from "expo-router";
import { Megaphone } from "lucide-react-native";
import { View } from "react-native";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SkeletonRow } from "@/components/Skeleton";
import { useAnnouncementsQuery } from "@/features/announcements/queries";
import { WardSwitcher } from "@/features/guardian/WardSwitcher";
import { formatDateTime } from "@/features/shared/format";
import { spacing, useTheme } from "@/theme/theme";

export default function GuardianNoticesScreen() {
  const query = useAnnouncementsQuery();
  const { colors } = useTheme();
  const announcements = (query.data ?? [])
    .filter((item) => item.status === "PUBLISHED")
    .sort(
      (a, b) =>
        Number(b.isPinned) - Number(a.isPinned) ||
        b.createdAt.localeCompare(a.createdAt),
    );
  return (
    <Screen
      title="Notices"
      subtitle="Published school announcements"
      right={<WardSwitcher />}
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
            title="Unable to load notices"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => void query.refetch()}
            hue="amber"
          />
        ) : announcements.length === 0 ? (
          <EmptyState
            title="No notices yet"
            message="Published school announcements will appear here."
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
                divider={index < announcements.length - 1}
                hue="amber"
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
