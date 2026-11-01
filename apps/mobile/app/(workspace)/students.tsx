import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react-native";
import { Pressable, Text, TextInput, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { GlassCard } from "@/components/GlassCard";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { TAB_BAR_CLEARANCE } from "@/components/GlassTabBar";
import { type, useTheme, withAlpha } from "@/theme/theme";

const records = [
  { name: "Kofi Mensah", id: "SH-2026-0142", className: "JHS 2A", status: "Active" },
  { name: "Ama Boateng", id: "SH-2026-0138", className: "JHS 2A", status: "Active" },
  { name: "Yaw Asante", id: "SH-2026-0129", className: "JHS 1B", status: "Active" },
  { name: "Akosua Owusu", id: "SH-2026-0117", className: "JHS 3A", status: "Pending" },
  { name: "Kojo Addo", id: "SH-2026-0108", className: "JHS 1A", status: "Active" },
];
const filters = [{ value: "All", label: "All" }, { value: "JHS 1A", label: "JHS 1" }, { value: "JHS 2A", label: "JHS 2" }, { value: "JHS 3A", label: "JHS 3" }] as const;

export default function StudentsScreen() {
  const { colors, accent } = useTheme();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<string>("All");
  const visible = useMemo(() => records.filter((r) => (filter === "All" || r.className === filter) && (r.name.toLowerCase().includes(query.toLowerCase()) || r.id.toLowerCase().includes(query.toLowerCase()))), [filter, query]);
  return <Screen title="Students" subtitle="Directory · 1,248 enrolled" bottomInset={TAB_BAR_CLEARANCE}>
    <GlassCard padding={12} style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
        <Search size={18} color={colors.mutedForeground} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search name or student ID" placeholderTextColor={colors.mutedForeground} style={{ flex: 1, color: colors.foreground, fontSize: 14, paddingVertical: 7 }} accessibilityLabel="Search students" />
        <SlidersHorizontal size={18} color={accent} />
      </View>
    </GlassCard>
    <SegmentedControl value={filter} onChange={setFilter} options={filters.map((x) => ({ ...x }))} accessibilityLabel="Filter students by class" />
    <View style={{ flexDirection: "row", justifyContent: "space-between", marginVertical: 16 }}>
      <Text style={[type.bodyStrong, { color: colors.foreground }]}>{visible.length} sample records</Text>
      <Text style={[type.caption, { color: colors.mutedForeground }]}>Updated just now</Text>
    </View>
    <GlassCard padding={12}>
      {visible.map((item, index) => <ListRow key={item.id} leading={<Avatar name={item.name} size={42} />} title={item.name} subtitle={item.id + " · " + item.className} trailing={<Text style={{ color: item.status === "Active" ? colors.success : colors.warning, fontSize: 11 }}>{item.status}</Text>} divider={index !== visible.length - 1} />)}
      {visible.length === 0 ? <Text style={[type.caption, { color: colors.mutedForeground, padding: 14 }]}>No matching sample students.</Text> : null}
    </GlassCard>
    <Text style={[type.caption, { color: colors.mutedForeground, marginTop: 14 }]}>Directory preview · Search and class filters work locally on sample records.</Text>
  </Screen>;
}
