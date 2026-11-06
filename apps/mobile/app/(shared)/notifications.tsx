import { router, type Href } from "expo-router";
import { Bell, Settings2 } from "lucide-react-native";
import { View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SectionHeader, StatusPill } from "@/components/ModulePrimitives";
import { SkeletonRow } from "@/components/Skeleton";
import { Text } from "@/components/Typography";
import { markAllNotificationsRead, markNotificationRead } from "@/api/shared";
import { useScopedMutation } from "@/features/shared/mutations";
import {
  formatDateTime,
  formatDay,
  groupByDay,
} from "@/features/shared/format";
import { useNotificationsQuery } from "@/features/shared/queries";
import { spacing, type, useTheme } from "@/theme/theme";

export default function NotificationsScreen() {
  const query = useNotificationsQuery();
  const markRead = useScopedMutation((id: string) =>
    markNotificationRead({ params: { id } }),
  );
  const markAllRead = useScopedMutation(() => markAllNotificationsRead());
  const { colors } = useTheme();
  const groups = groupByDay(query.data?.items ?? []);

  return (
    <Screen
      title="Updates"
      subtitle="Notifications for your school account"
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <View style={{ gap: spacing.lg }}>
        <View style={{ flexDirection: "row", gap: spacing.sm }}>
          <Button
            label="History"
            variant="secondary"
            block={false}
            onPress={() =>
              router.push("/(shared)/notification-history" as Href)
            }
          />
          <Button
            label="Settings"
            variant="secondary"
            block={false}
            icon={<Settings2 size={18} color={colors.foreground} />}
            onPress={() =>
              router.push("/(shared)/notification-settings" as Href)
            }
          />
        </View>
        {query.data?.unreadCount ? (
          <View style={{ gap: spacing.sm }}>
            <StatusPill label={`${query.data.unreadCount} unread`} hue="rose" />
            <Button
              label="Mark all as read"
              variant="ghost"
              onPress={() => markAllRead.mutate(undefined)}
              loading={markAllRead.isPending}
            />
          </View>
        ) : null}
        {markRead.isError || markAllRead.isError ? (
          <Text
            accessibilityRole="alert"
            style={[type.caption, { color: colors.destructive }]}
          >
            We couldn&apos;t update notifications. Please try again.
          </Text>
        ) : null}
        {query.isPending ? (
          <Card>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </Card>
        ) : query.isError ? (
          <ErrorState
            title="Unable to load updates"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => void query.refetch()}
            hue="rose"
          />
        ) : groups.length === 0 ? (
          <EmptyState
            title="You're all caught up"
            message="New school notifications will appear here."
            icon={<Bell size={32} color={colors.mutedForeground} />}
            hue="rose"
          />
        ) : (
          groups.map((group) => (
            <View key={group.day} style={{ gap: spacing.sm }}>
              <SectionHeader title={formatDay(group.entries[0]!.createdAt)} />
              <Card>
                {group.entries.map((notification, index) => (
                  <ListRow
                    key={notification.id}
                    title={notification.title}
                    subtitle={`${notification.message} · ${formatDateTime(notification.createdAt)}`}
                    leading={<Bell size={20} color={colors.primary} />}
                    status={notification.isRead ? "Read" : "Unread"}
                    hue={notification.isRead ? "sky" : "rose"}
                    divider={index < group.entries.length - 1}
                    onPress={
                      notification.isRead
                        ? undefined
                        : () => markRead.mutate(notification.id)
                    }
                  />
                ))}
              </Card>
            </View>
          ))
        )}
      </View>
    </Screen>
  );
}
