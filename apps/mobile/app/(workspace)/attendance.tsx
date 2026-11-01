import { CalendarDays, CheckCircle2, Clock3, UserX } from "lucide-react-native";
import { Text, View } from "react-native";
import { GlassCard } from "@/components/GlassCard";
import { ListRow } from "@/components/ListRow";
import { WorkspaceScreen } from "@/components/WorkspaceScreen";
import { StatTile } from "@/components/StatTile";
import { type, useTheme } from "@/theme/theme";

const classes = [
  { name: "JHS 1A", present: "38 / 40", note: "2 absent", state: "Submitted" },
  { name: "JHS 1B", present: "36 / 37", note: "1 absent", state: "Submitted" },
  { name: "JHS 2A", present: "—", note: "Register not submitted", state: "Pending" },
  { name: "JHS 2B", present: "41 / 42", note: "1 absent", state: "Submitted" },
  { name: "JHS 3A", present: "35 / 35", note: "Full attendance", state: "Submitted" },
];
export default function AttendanceScreen() {
  const { colors } = useTheme();
  return <WorkspaceScreen title="Attendance" subtitle="Monday · Daily register overview">
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
      <View style={{ width: "48%" }}><StatTile label="Present" value="97.4%" hint="Across submitted classes" icon={<CheckCircle2 size={18} color={colors.success} />} tone="success" /></View>
      <View style={{ width: "48%" }}><StatTile label="Absent" value="2.6%" hint="Today's sample" icon={<UserX size={18} color={colors.warning} />} tone="warning" /></View>
      <View style={{ width: "48%" }}><StatTile label="Pending" value="1" hint="Registers outstanding" icon={<Clock3 size={18} color={colors.info} />} tone="neutral" /></View>
      <View style={{ width: "48%" }}><StatTile label="School day" value="Mon" hint="2 November 2026" icon={<CalendarDays size={18} color={colors.primary} />} tone="neutral" /></View>
    </View>
    <Text style={[type.headline, { color: colors.foreground, marginBottom: 12 }]}>Class registers</Text>
    <GlassCard padding={12}>
      {classes.map((c, i) => <ListRow key={c.name} title={c.name} subtitle={c.present + " present · " + c.note} trailing={<Text style={{ color: c.state === "Submitted" ? colors.success : colors.warning, fontSize: 11 }}>{c.state}</Text>} divider={i !== classes.length - 1} />)}
    </GlassCard>
    <Text style={[type.caption, { color: colors.mutedForeground, marginTop: 14 }]}>Illustrative attendance data. Register submission and corrections are not enabled in this UI phase.</Text>
  </WorkspaceScreen>;
}
