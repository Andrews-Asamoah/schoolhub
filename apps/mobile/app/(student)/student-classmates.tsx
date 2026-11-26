import { useState } from "react";
import { TextField } from "@/components/TextField";
import { UsersRound } from "lucide-react-native";
import { View } from "react-native";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SkeletonRow } from "@/components/Skeleton";
import { StudentBackButton } from "@/features/student/BackButton";
import { useMyClassmatesQuery } from "@/features/student/queries";
import { spacing, useTheme } from "@/theme/theme";

export default function StudentClassmatesScreen() {
  const query = useMyClassmatesQuery();
  const { colors } = useTheme();
  const [search, setSearch] = useState("");
  const filtered =
    query.data?.classmates.filter((row) =>
      [row.name, row.house].some((value) =>
        value?.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
      ),
    ) ?? [];
  return (
    <Screen
      title="Classmates"
      subtitle={query.data?.class?.name ?? "Your current class"}
      left={<StudentBackButton />}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <View style={{ gap: spacing.lg }}>
        {query.data?.classmates.length ? (
          <TextField
            label="Search classmates"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
        ) : null}
        {query.isPending ? (
          <Card>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </Card>
        ) : query.isError ? (
          <ErrorState
            title="Unable to load classmates"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => void query.refetch()}
            hue="pink"
          />
        ) : !query.data.classmates.length ? (
          <EmptyState
            title="No classmates to show"
            message="Your classmates will appear here when you have a current class enrollment."
            icon={<UsersRound size={32} color={colors.mutedForeground} />}
            hue="pink"
          />
        ) : (
          <Card>
            {filtered.length === 0 ? (
              <EmptyState
                title="No matching classmates"
                message="Try another search."
              />
            ) : null}
            {filtered.map((classmate, index, entries) => (
              <ListRow
                key={classmate.id}
                title={
                  classmate.isSelf ? `${classmate.name} (You)` : classmate.name
                }
                subtitle={classmate.house}
                leading={<UsersRound size={19} color={colors.primary} />}
                divider={index < entries.length - 1}
                hue="pink"
              />
            ))}
          </Card>
        )}
      </View>
    </Screen>
  );
}
