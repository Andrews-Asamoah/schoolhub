import { BookOpenCheck, ChartNoAxesColumnIncreasing, FileText } from "lucide-react-native";
import { Text, View } from "react-native";
import { GlassCard } from "@/components/GlassCard";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { StatTile } from "@/components/StatTile";
import { TAB_BAR_CLEARANCE } from "@/components/GlassTabBar";
import { type, useTheme, withAlpha } from "@/theme/theme";

const subjects = [{ name: "Mathematics", average: "78.4%", progress: 0.78 }, { name: "Integrated Science", average: "82.1%", progress: 0.82 }, { name: "English Language", average: "74.8%", progress: 0.75 }, { name: "Computing", average: "88.2%", progress: 0.88 }];
export default function AssessmentsScreen() {
  const { colors, accent } = useTheme();
  return <Screen title="Assessments" subtitle="Academic progress at a glance" bottomInset={TAB_BAR_CLEARANCE}>
    <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
      <View style={{ flex: 1 }}><StatTile label="Class average" value="80.6%" hint="Current term" icon={<ChartNoAxesColumnIncreasing size={18} color={accent} />} tone="neutral" /></View>
      <View style={{ flex: 1 }}><StatTile label="Published" value="8 / 10" hint="Assessment items" icon={<BookOpenCheck size={18} color={colors.success} />} tone="success" /></View>
    </View>
    <Text style={[type.headline, { color: colors.foreground, marginBottom: 12 }]}>Subject performance</Text>
    <GlassCard padding={16} style={{ marginBottom: 20 }}>
      {subjects.map((s, i) => <View key={s.name} style={{ marginBottom: i === subjects.length - 1 ? 0 : 18 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={[type.bodyStrong, { color: colors.foreground }]}>{s.name}</Text>
          <Text style={[type.bodyStrong, { color: accent }]}>{s.average}</Text>
        </View>
        <View style={{ height: 8, borderRadius: 8, backgroundColor: colors.muted, overflow: "hidden" }}>
          <View style={{ width: (s.progress * 100) + "%", height: 8, borderRadius: 8, backgroundColor: accent }} />
        </View>
      </View>)}
    </GlassCard>
    <Text style={[type.headline, { color: colors.foreground, marginBottom: 12 }]}>Recent assessment activity</Text>
    <GlassCard padding={12}>
      <ListRow leading={<FileText size={20} color={accent} />} title="End of unit assessment" subtitle="JHS 2A · Mathematics · 28 October" trailing={<Text style={{ color: colors.success, fontSize: 11 }}>Published</Text>} divider />
      <ListRow leading={<FileText size={20} color={accent} />} title="Practical science task" subtitle="JHS 2A · Integrated Science · 30 October" trailing={<Text style={{ color: colors.warning, fontSize: 11 }}>Review</Text>} />
    </GlassCard>
    <Text style={[type.caption, { color: colors.mutedForeground, marginTop: 14 }]}>Sample academic data only. Official scores and report cards must come from the school system.</Text>
  </Screen>;
}
