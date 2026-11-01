import { useMemo, useState } from "react";
import { Search } from "lucide-react-native";
import { Text, TextInput, View } from "react-native";
import { Avatar } from "@/components/Avatar";
import { GlassCard } from "@/components/GlassCard";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { TAB_BAR_CLEARANCE } from "@/components/GlassTabBar";
import { type, useTheme } from "@/theme/theme";

const people = [
  { name: "Adwoa Asare", role: "Teacher", department: "Languages" },
  { name: "Kwame Osei", role: "Teacher", department: "Science" },
  { name: "Esi Nyarko", role: "Administrator", department: "Administration" },
  { name: "Daniel Tetteh", role: "Accountant", department: "Finance" },
  { name: "Mavis Appiah", role: "Teacher", department: "Mathematics" },
];
const filters = [{ value: "All", label: "All" }, { value: "Teacher", label: "Teachers" }, { value: "Administrator", label: "Admin" }, { value: "Accountant", label: "Finance" }] as const;

export default function StaffScreen() {
  const { colors } = useTheme();
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const visible = useMemo(() => people.filter((p) => (filter === "All" || p.role === filter) && p.name.toLowerCase().includes(query.toLowerCase())), [filter, query]);
  return <Screen title="Staff directory" subtitle="People who make your school run" bottomInset={TAB_BAR_CLEARANCE}>
    <GlassCard padding={12} style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
        <Search size={18} color={colors.mutedForeground} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search staff members" placeholderTextColor={colors.mutedForeground} style={{ flex: 1, color: colors.foreground, paddingVertical: 7 }} accessibilityLabel="Search staff" />
      </View>
    </GlassCard>
    <SegmentedControl value={filter} onChange={setFilter} options={filters.map((x) => ({ ...x }))} accessibilityLabel="Filter staff by role" />
    <Text style={[type.bodyStrong, { color: colors.foreground, marginVertical: 16 }]}>{visible.length} sample staff members</Text>
    <GlassCard padding={12}>
      {visible.map((p, i) => <ListRow key={p.name} leading={<Avatar name={p.name} size={42} />} title={p.name} subtitle={p.role + " · " + p.department} trailing={<Text style={{ color: colors.success, fontSize: 11 }}>Active</Text>} divider={i !== visible.length - 1} />)}
      {visible.length === 0 ? <Text style={[type.caption, { color: colors.mutedForeground, padding: 14 }]}>No matching sample staff.</Text> : null}
    </GlassCard>
    <Text style={[type.caption, { color: colors.mutedForeground, marginTop: 14 }]}>Sample directory only. Employment records and permissions are not connected.</Text>
  </Screen>;
}
