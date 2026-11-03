import { CircleDollarSign } from "lucide-react-native";
import { View } from "react-native";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SkeletonRow } from "@/components/Skeleton";
import { Text } from "@/components/Typography";
import { useGuardian } from "@/features/guardian/context";
import { WardSwitcher } from "@/features/guardian/WardSwitcher";
import { useWardFeesQuery } from "@/features/guardian/queries";
import { spacing, type, useTheme } from "@/theme/theme";

const money = (value: string) => {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "GHS",
      }).format(amount)
    : "—";
};

export default function GuardianFeesScreen() {
  const { activeWard } = useGuardian();
  const query = useWardFeesQuery(activeWard?.id ?? "");
  const { colors } = useTheme();
  return (
    <Screen
      title="Fees"
      subtitle="View-only account statement"
      right={<WardSwitcher />}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <View style={{ gap: spacing.lg }}>
        {!activeWard ? (
          <EmptyState
            title="No child selected"
            message="Link a child to view a fee statement."
            hue="emerald"
          />
        ) : query.isPending ? (
          <Card>
            <SkeletonRow />
            <SkeletonRow />
          </Card>
        ) : query.isError ? (
          <ErrorState
            title="Unable to load the fee statement"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => void query.refetch()}
            hue="emerald"
          />
        ) : !query.data ? (
          <EmptyState
            title="Statement unavailable"
            message="No fee statement is available for this child."
            hue="emerald"
          />
        ) : (
          <>
            <Card hue="emerald">
              <Text style={[type.caption, { color: colors.mutedForeground }]}>
                Current balance
              </Text>
              <Text
                accessibilityRole="header"
                style={[
                  type.display,
                  { color: colors.foreground, marginTop: spacing.sm },
                ]}
              >
                {money(query.data.closingBalance)}
              </Text>
              <Text
                style={[
                  type.caption,
                  { color: colors.mutedForeground, marginTop: spacing.sm },
                ]}
              >
                All-time statement · Payments and adjustments are shown for
                reference only.
              </Text>
            </Card>
            <Card>
              <ListRow
                title="Statement activity"
                subtitle={`${query.data.entries.length} ${query.data.entries.length === 1 ? "entry" : "entries"}`}
                leading={<CircleDollarSign size={20} color={colors.primary} />}
                divider={query.data.entries.length > 0}
              />
              {query.data.entries.length ? (
                query.data.entries
                  .slice()
                  .reverse()
                  .map((entry, index, entries) => (
                    <ListRow
                      key={entry.id}
                      title={entry.description}
                      subtitle={`${entry.date.slice(0, 10)} · ${entry.type.replaceAll("_", " ")}`}
                      trailing={
                        <View style={{ alignItems: "flex-end" }}>
                          <Text
                            style={[
                              type.bodyStrong,
                              { color: colors.foreground },
                            ]}
                          >
                            {money(entry.amount)}
                          </Text>
                          <Text
                            style={[
                              type.caption,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            Balance {money(entry.runningBalance)}
                          </Text>
                        </View>
                      }
                      divider={index < entries.length - 1}
                    />
                  ))
              ) : (
                <Text
                  style={[
                    type.body,
                    {
                      color: colors.mutedForeground,
                      paddingVertical: spacing.md,
                    },
                  ]}
                >
                  No statement activity yet.
                </Text>
              )}
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}
