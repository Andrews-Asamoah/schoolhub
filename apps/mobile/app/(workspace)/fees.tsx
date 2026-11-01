import { ArrowDownLeft, ArrowUpRight, Receipt, Wallet } from "lucide-react-native";
import { Text, View } from "react-native";
import { GlassCard } from "@/components/GlassCard";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { StatTile } from "@/components/StatTile";
import { TAB_BAR_CLEARANCE } from "@/components/GlassTabBar";
import { type, useTheme } from "@/theme/theme";

export default function FeesScreen() {
  const { colors, accent } = useTheme();
  return <Screen title="Fees & payments" subtitle="A clear view of fee accounts" bottomInset={TAB_BAR_CLEARANCE}>
    <GlassCard padding={18} strong style={{ marginBottom: 14 }}>
      <Text style={[type.caption, { color: colors.mutedForeground }]}>Outstanding balance · Sample account</Text>
      <Text style={{ color: colors.foreground, fontSize: 30, fontFamily: "Inter_700Bold", marginTop: 5 }}>GH₵ 450.00</Text>
      <Text style={[type.caption, { color: colors.mutedForeground, marginTop: 4 }]}>Current academic term</Text>
    </GlassCard>
    <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
      <View style={{ flex: 1 }}><StatTile label="Paid" value="GH₵ 1,800" hint="This term" icon={<ArrowDownLeft size={18} color={colors.success} />} tone="success" /></View>
      <View style={{ flex: 1 }}><StatTile label="Due" value="GH₵ 450" hint="Outstanding" icon={<ArrowUpRight size={18} color={colors.warning} />} tone="warning" /></View>
    </View>
    <Text style={[type.headline, { color: colors.foreground, marginBottom: 12 }]}>Recent transactions</Text>
    <GlassCard padding={12}>
      <ListRow leading={<Receipt size={20} color={accent} />} title="Tuition payment" subtitle="28 October · Reference SH-PAY-1024" trailing={<Text style={{ color: colors.success, fontSize: 12 }}>+ GH₵ 900</Text>} divider />
      <ListRow leading={<Receipt size={20} color={accent} />} title="PTA levy" subtitle="12 October · Reference SH-PAY-0981" trailing={<Text style={{ color: colors.success, fontSize: 12 }}>+ GH₵ 300</Text>} divider />
      <ListRow leading={<Wallet size={20} color={accent} />} title="Transport charge" subtitle="Due 15 November" trailing={<Text style={{ color: colors.warning, fontSize: 12 }}>GH₵ 450</Text>} />
    </GlassCard>
    <Text style={[type.caption, { color: colors.mutedForeground, marginTop: 14 }]}>No payments can be initiated or recorded in this UI-only phase. Figures are examples, not a real statement.</Text>
  </Screen>;
}
