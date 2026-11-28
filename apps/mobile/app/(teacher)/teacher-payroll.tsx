import { useRef, useState } from "react";
import { View } from "react-native";
import { ReceiptText } from "lucide-react-native";
import { getTeacherPayslips, shareTeacherPayslip } from "@/api/teacher";
import { Button } from "@/components/Button";
import { ListRow } from "@/components/ListRow";
import { EmptyState } from "@/components/States";
import { Text } from "@/components/Typography";
import { useTeacherQuery } from "@/features/teacher/queries";
import { Copy, Panel, QueryState, TeacherPage } from "@/features/teacher/ui";
import { sessionStore } from "@/lib/session";
import { spacing, type, useTheme } from "@/theme/theme";

const money = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
});
const periodFormatter = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export default function TeacherPayroll() {
  const { colors } = useTheme();
  const query = useTeacherQuery(["payslips"], (signal) =>
    getTeacherPayslips({ signal }),
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const busy = useRef(false);

  async function openPdf(id: string) {
    if (busy.current) return;
    busy.current = true;
    const revision = sessionStore.getRevision();
    setOpening(id);
    setFailed(null);
    try {
      await shareTeacherPayslip({ params: { payslipId: id } });
    } catch {
      if (sessionStore.getRevision() === revision) setFailed(id);
    } finally {
      busy.current = false;
      setOpening(null);
    }
  }

  return (
    <TeacherPage
      title="My payroll"
      subtitle="Your approved payslips"
      back
      query={query}
    >
      <QueryState query={query}>
        {query.data?.length ? (
          <Panel title="Payslip history">
            {query.data.map((slip) => {
              const { year, month, status } = slip.payrollRecord;
              const period = periodFormatter.format(
                new Date(Date.UTC(year, month - 1, 1)),
              );
              const paid = status === "PAID";
              return (
                <View key={slip.id}>
                  <ListRow
                    title={period}
                    subtitle={`${money.format(Number(slip.netSalary))} net pay`}
                    status={paid ? "Paid" : "Approved"}
                    hue={paid ? "emerald" : "indigo"}
                    leading={<ReceiptText size={20} color={colors.primary} />}
                    onPress={() =>
                      setExpanded(expanded === slip.id ? null : slip.id)
                    }
                    chevron
                    divider
                  />
                  {expanded === slip.id && (
                    <View
                      style={{ gap: spacing.sm, paddingVertical: spacing.md }}
                    >
                      {[
                        ["Basic salary", slip.basicSalary],
                        ["Allowances", slip.allowances],
                        ["Gross pay", slip.grossSalary],
                        ["Employee SSNIT", slip.ssnitEmployee],
                        ["PAYE", slip.incomeTax],
                        ["Other deductions", slip.otherDeductions],
                      ].map(([label, value]) => (
                        <View
                          key={label}
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            justifyContent: "space-between",
                            gap: spacing.sm,
                          }}
                        >
                          <Text
                            style={[
                              type.body,
                              { color: colors.mutedForeground },
                            ]}
                          >
                            {label}
                          </Text>
                          <Text
                            style={[
                              type.bodyStrong,
                              { color: colors.foreground },
                            ]}
                          >
                            {money.format(Number(value))}
                          </Text>
                        </View>
                      ))}
                      {!paid && (
                        <Text
                          style={[
                            type.caption,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          Awaiting payment
                        </Text>
                      )}
                      <Button
                        label="Open payslip PDF"
                        variant="secondary"
                        loading={opening === slip.id}
                        disabled={opening !== null}
                        onPress={() => void openPdf(slip.id)}
                      />
                      {failed === slip.id && (
                        <Copy alert>Could not open the PDF. Try again.</Copy>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </Panel>
        ) : (
          <EmptyState
            title="No payslips yet"
            message="Your payslips will appear here once payroll is approved."
            hue="indigo"
          />
        )}
      </QueryState>
    </TeacherPage>
  );
}
