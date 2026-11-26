import { router, type Href } from "expo-router";
import { Megaphone } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { SearchBar } from "@/components/Fields";
import { SelectField } from "@/components/SelectField";
import { Button } from "@/components/Button";
import { canEnterRole } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SkeletonRow } from "@/components/Skeleton";
import { useAnnouncementsQuery } from "@/features/announcements/queries";
import { formatDateTime } from "@/features/shared/format";
import { spacing, useTheme } from "@/theme/theme";

export default function AnnouncementsScreen() {
  const query = useAnnouncementsQuery();
  const session = useSession();
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const teacher = canEnterRole(session, "teacher");
  const announcements =
    query.data?.filter((item) => item.status === "PUBLISHED") ?? [];
  const categories = [...new Set(announcements.map((item) => item.category))];
  const matches = announcements.filter(
    (item) =>
      (!category || item.category === category) &&
      `${item.title} ${item.content}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );

  return (
    <Screen
      title="Announcements"
      subtitle="Notices from your school community"
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <View style={{ gap: spacing.lg }}>
        {teacher ? (
          <Button
            label="New class announcement"
            onPress={() =>
              router.push("/(teacher)/teacher-announcement-new" as Href)
            }
          />
        ) : null}
        {teacher && announcements.length ? (
          <>
            <SearchBar
              label="Search announcements"
              value={search}
              onChange={setSearch}
            />
            <SelectField
              label="Category"
              value={category}
              onChange={setCategory}
              options={[
                { value: "", label: "All categories" },
                ...categories.map((item) => ({
                  value: item,
                  label:
                    item.charAt(0) +
                    item.slice(1).toLowerCase().replaceAll("_", " "),
                })),
              ]}
            />
          </>
        ) : null}
        {query.isPending ? (
          <Card>
            <SkeletonRow />
            <SkeletonRow />
          </Card>
        ) : query.isError ? (
          <ErrorState
            title="Unable to load announcements"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => void query.refetch()}
            hue="amber"
          />
        ) : matches.length === 0 ? (
          <EmptyState
            title={
              announcements.length
                ? "No announcements match"
                : "No announcements yet"
            }
            message={
              announcements.length
                ? "Try another search or category."
                : "Published school notices will appear here."
            }
            icon={<Megaphone size={32} color={colors.mutedForeground} />}
            hue="amber"
          />
        ) : (
          <Card>
            {matches.map((item, index) => (
              <ListRow
                key={item.id}
                title={item.title}
                subtitle={`${item.category} · ${formatDateTime(item.createdAt)}`}
                leading={<Megaphone size={20} color={colors.primary} />}
                status={item.isPinned ? "Pinned" : undefined}
                hue="amber"
                divider={index < matches.length - 1}
                onPress={() =>
                  router.push(
                    `/(shared)/announcements/${encodeURIComponent(item.id)}` as Href,
                  )
                }
              />
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}
