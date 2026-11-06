import { useState } from "react";
import { View } from "react-native";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SkeletonRow } from "@/components/Skeleton";
import { SegmentedControl } from "@/components/SegmentedControl";
import { useDeliveryHistoryQuery } from "@/features/shared/queries";
import { formatDateTime } from "@/features/shared/format";
import { spacing } from "@/theme/theme";

type Channel = "ALL" | "EMAIL" | "SMS";

export default function DeliveryHistoryScreen() {
  const query = useDeliveryHistoryQuery();
  const [channel, setChannel] = useState<Channel>("ALL");
  const items = (query.data?.items ?? []).filter(
    (item) => channel === "ALL" || item.channel === channel,
  );

  return (
    <Screen
      title="Delivery history"
      subtitle="Recent email and SMS delivery status"
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <View style={{ gap: spacing.lg }}>
        <SegmentedControl
          accessibilityLabel="Delivery channel filter"
          value={channel}
          onChange={setChannel}
          options={[
            { value: "ALL", label: "All" },
            { value: "EMAIL", label: "Email" },
            { value: "SMS", label: "SMS" },
          ]}
        />
        {query.isPending ? (
          <Card>
            <SkeletonRow />
            <SkeletonRow />
          </Card>
        ) : query.isError ? (
          <ErrorState
            title="Unable to load delivery history"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => void query.refetch()}
          />
        ) : !items.length ? (
          <EmptyState
            title="No delivery records"
            message="Sent email and SMS updates will appear here."
            hue="sky"
          />
        ) : (
          <Card>
            {items.map((item, index) => (
              <ListRow
                key={item.id}
                title={`${item.channel} · ${item.status}`}
                subtitle={`${formatDateTime(item.createdAt)} · ${item.attempts} attempt${item.attempts === 1 ? "" : "s"}`}
                divider={index < items.length - 1}
                status={item.status}
                hue={item.status === "DELIVERED" ? "emerald" : "amber"}
              />
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}
