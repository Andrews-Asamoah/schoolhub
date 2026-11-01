import { ChevronRight, GraduationCap } from "lucide-react-native";
import { Text, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { GlassCard } from "@/components/GlassCard";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { TAB_BAR_CLEARANCE } from "@/components/GlassTabBar";
import { type, useTheme } from "@/theme/theme";

export default function ChildrenScreen() {
  const { colors, accent } = useTheme();
  return <Screen title="My children" subtitle="Parent and guardian overview" bottomInset={TAB_BAR_CLEARANCE}>
    <GlassCard padding={16} style={{ marginBottom: 18 }}>
      <Text style={[type.bodyStrong, { color: colors.foreground }]}>Linked learner profiles</Text>
      <Text style={[type.caption, { color: colors.mutedForeground, marginTop: 4 }]}>A parent view should only show children explicitly linked to the signed-in guardian account.</Text>
    </GlassCard>
    <GlassCard padding={12} style={{ marginBottom: 14 }}>
      <ListRow leading={<Avatar name="Kofi Mensah" size={48} />} title="Kofi Mensah" subtitle="JHS 2A · Student ID SH-2026-0142" trailing={<ChevronRight size={18} color={colors.mutedForeground} />} divider />
      <View style={{ paddingLeft: 60, paddingVertical: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={[type.caption, { color: colors.mutedForeground }]}>Attendance this term</Text>
          <Text style={[type.bodyStrong, { color: colors.success }]}>97%</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={[type.caption, { color: colors.mutedForeground }]}>Latest assessment</Text>
          <Text style={[type.bodyStrong, { color: colors.foreground }]}>84.5%</Text>
        </View>
      </View>
    </GlassCard>
    <GlassCard padding={12}>
      <ListRow leading={<Avatar name="Ama Mensah" size={48} />} title="Ama Mensah" subtitle="Primary 5 · Student ID SH-2026-0218" trailing={<ChevronRight size={18} color={colors.mutedForeground} />} />
      <View style={{ paddingLeft: 60, paddingVertical: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
          <Text style={[type.caption, { color: colors.mutedForeground }]}>Attendance this term</Text>
          <Text style={[type.bodyStrong, { color: colors.success }]}>99%</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={[type.caption, { color: colors.mutedForeground }]}>Latest assessment</Text>
          <Text style={[type.bodyStrong, { color: colors.foreground }]}>91.0%</Text>
        </View>
      </View>
    </GlassCard>
    <Text style={[type.caption, { color: colors.mutedForeground, marginTop: 14 }]}>Illustrative child profiles only. No guardian-to-student relationship is being read or changed.</Text>
  </Screen>;
}
