import { useMemo, useState } from "react";
import { FlashList } from "@shopify/flash-list";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar } from "@/components/Avatar";
import { Card } from "@/components/Surface";
import { ListRow } from "@/components/ListRow";
import { WorkspaceScreen } from "@/components/WorkspaceScreen";
import { SearchBar } from "@/components/Fields";
import { FilterChips, SectionHeader } from "@/components/ModulePrimitives";
import { EmptyState } from "@/components/States";
import { useTheme } from "@/theme/theme";

const records = [
  {
    name: "Kofi Mensah",
    id: "SH-2026-0142",
    className: "JHS 2A",
    status: "Active",
  },
  {
    name: "Ama Boateng",
    id: "SH-2026-0138",
    className: "JHS 2A",
    status: "Active",
  },
  {
    name: "Yaw Asante",
    id: "SH-2026-0129",
    className: "JHS 1B",
    status: "Active",
  },
  {
    name: "Akosua Owusu",
    id: "SH-2026-0117",
    className: "JHS 3A",
    status: "Pending",
  },
  {
    name: "Kojo Addo",
    id: "SH-2026-0108",
    className: "JHS 1A",
    status: "Active",
  },
];
const filters = [
  { value: "All", label: "All" },
  { value: "JHS 1", label: "JHS 1" },
  { value: "JHS 2", label: "JHS 2" },
  { value: "JHS 3", label: "JHS 3" },
] as const;

export default function StudentsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const visible = useMemo(
    () =>
      records.filter(
        (r) =>
          (filter === "All" || r.className.startsWith(filter)) &&
          (r.name.toLowerCase().includes(query.toLowerCase()) ||
            r.id.toLowerCase().includes(query.toLowerCase())),
      ),
    [filter, query],
  );
  type Item =
    | { kind: "section"; id: string }
    | { kind: "student"; id: string; record: (typeof records)[number] };
  const data: Item[] = [
    { kind: "section", id: "header" },
    ...visible.map((record) => ({
      kind: "student" as const,
      id: record.id,
      record,
    })),
  ];
  return (
    <WorkspaceScreen
      title="Students"
      subtitle="Development directory fixtures"
      scroll={false}
    >
      <FlashList
        data={data}
        keyExtractor={(item) => item.id}
        stickyHeaderIndices={[0]}
        getItemType={(item) => item.kind}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        ListHeaderComponent={
          <View style={{ gap: 16, paddingBottom: 20 }}>
            <SearchBar
              label="Search students"
              value={query}
              onChange={setQuery}
            />
            <FilterChips
              label="Filter students by class"
              value={filter}
              onChange={setFilter}
              options={filters}
            />
          </View>
        }
        renderItem={({ item }) =>
          item.kind === "section" ? (
            <View style={{ padding: 16, backgroundColor: colors.card }}>
              <SectionHeader title={`${visible.length} example students`} />
            </View>
          ) : (
            <Card padding={12}>
              <ListRow
                title={item.record.name}
                subtitle={`${item.record.id} · ${item.record.className}`}
                leading={<Avatar name={item.record.name} />}
                status={item.record.status}
                hue={item.record.status === "Active" ? "emerald" : "amber"}
              />
            </Card>
          )
        }
        ListFooterComponent={
          visible.length === 0 ? (
            <EmptyState
              title="No matching students"
              message="Try another name or class filter."
            />
          ) : null
        }
      />
    </WorkspaceScreen>
  );
}
