import { useState } from "react";
import { outputTable } from "@/features/shared/exports";
import { CircleDollarSign } from "lucide-react-native";
import { Linking, View } from "react-native";
import { Button } from "@/components/Button";
import { useToast } from "@/components/Toast";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SkeletonRow } from "@/components/Skeleton";
import { Text } from "@/components/Typography";
import { useGuardian } from "@/features/guardian/context";
import { WardSwitcher } from "@/features/guardian/WardSwitcher";
import { useWardFeesQuery } from "@/features/guardian/queries";
import { guardianFeesPortalUrl } from "@/lib/portal-links";
import { useSession } from "@/lib/session";
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
  const [exporting, setExporting] = useState(false);
  const { activeWard } = useGuardian();
  const { subdomain } = useSession();
  const { show } = useToast();
  const portalUrl = guardianFeesPortalUrl(subdomain);
  const query = useWardFeesQuery(activeWard?.id ?? "");
  const { colors } = useTheme();
  function exportFees(format: "print" | "pdf" | "xlsx") {
    if (!query.data) return;
    const { student, entries, openingBalance, closingBalance } = query.data;
    setExporting(true);
    void outputTable(
      `Fee statement · ${student.name}`,
      [
        "Date",
        "Type",
        "Reference",
        "Description",
        "Amount (GHS)",
        "Balance (GHS)",
      ],
      [
        ["", "", "", "Opening balance", "", Number(openingBalance)],
        ...entries.map((entry) => [
          entry.date.slice(0, 10),
          entry.type,
          entry.reference,
          entry.description,
          Number(entry.amount),
          Number(entry.runningBalance),
        ]),
        ["", "", "", "Closing balance", "", Number(closingBalance)],
      ],
      format,
    )
      .catch(() =>
        show({
          message: "Could not export this fee statement.",
          tone: "error",
        }),
      )
      .finally(() => setExporting(false));
  }
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
              <Text accessibilityRole="header" style={type.headline}>
                Balance by due date
              </Text>
              {[
                ["Not due / no due date", query.data.ageing.notDue],
                ["0–30 days overdue", query.data.ageing.days0To30],
                ["31–60 days overdue", query.data.ageing.days31To60],
                ["61–90 days overdue", query.data.ageing.days61To90],
                ["90+ days overdue", query.data.ageing.days90Plus],
                ["Unallocated credit", query.data.unallocatedCredit],
              ].map(([label, value]) => (
                <ListRow
                  key={label}
                  title={label!}
                  subtitle={money(value ?? "")}
                />
              ))}
            </Card>
            <Button
              label="Print statement"
              variant="secondary"
              disabled={exporting}
              onPress={() => exportFees("print")}
            />
            <Button
              label="Share statement PDF"
              variant="secondary"
              disabled={exporting}
              onPress={() => exportFees("pdf")}
            />
            <Button
              label="Share statement Excel"
              variant="secondary"
              disabled={exporting}
              onPress={() => exportFees("xlsx")}
            />
            {portalUrl ? (
              <Button
                label="Open fees in web portal"
                variant="secondary"
                onPress={() => {
                  void Linking.openURL(portalUrl).catch(() => {
                    show({
                      message: "Unable to open the web portal.",
                      tone: "error",
                    });
                  });
                }}
              />
            ) : null}
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
