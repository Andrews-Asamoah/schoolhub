import { router } from "expo-router";
import { ArrowLeft, Bell } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { SkeletonRow } from "@/components/Skeleton";
import { formatDateTime } from "@/features/shared/format";
import { useNotificationHistoryQuery } from "@/features/shared/queries";
import { spacing, useTheme } from "@/theme/theme";

type Status = "ALL" | "UNREAD" | "READ";

export default function NotificationHistoryScreen() {
  const [status, setStatus] = useState<Status>("ALL");
  const query = useNotificationHistoryQuery({ status, page: 1, limit: 50 });
  const { colors } = useTheme();

  return (
    <Screen
      title="Notification history"
      subtitle="Recent and read school updates"
      left={<ButtonBack onPress={() => router.back()} color={colors.primary} />}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <View style={{ gap: spacing.lg }}>
        <SegmentedControl
          accessibilityLabel="Notification history filter"
          value={status}
          onChange={setStatus}
          options={[
            { value: "ALL", label: "All" },
            { value: "UNREAD", label: "Unread" },
            { value: "READ", label: "Read" },
          ]}
        />
        {query.isPending ? (
          <Card>
            <SkeletonRow />
            <SkeletonRow />
          </Card>
        ) : query.isError ? (
          <ErrorState
            title="Unable to load history"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => void query.refetch()}
          />
        ) : query.data.items.length === 0 ? (
          <EmptyState title="No notifications found" hue="rose" />
        ) : (
          <Card>
            {query.data.items.map((item, index) => (
              <ListRow
                key={item.id}
                title={item.title}
                subtitle={`${item.message} · ${formatDateTime(item.createdAt)}`}
                leading={<Bell size={20} color={colors.primary} />}
                status={item.isRead ? "Read" : "Unread"}
                hue={item.isRead ? "sky" : "rose"}
                divider={index < query.data.items.length - 1}
              />
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}

function ButtonBack({
  onPress,
  color,
}: {
  onPress: () => void;
  color: string;
}) {
  return (
    <Button
      label="Back"
      variant="ghost"
      block={false}
      haptic={false}
      onPress={onPress}
      icon={<ArrowLeft size={18} color={color} />}
    />
  );
}
