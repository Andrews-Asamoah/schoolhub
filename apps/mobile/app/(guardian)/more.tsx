import { router, type Href } from "expo-router";
import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  Home,
  UsersRound,
} from "lucide-react-native";
import { View } from "react-native";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SkeletonRow } from "@/components/Skeleton";
import { Text } from "@/components/Typography";
import { useGuardian } from "@/features/guardian/context";
import { WardSwitcher } from "@/features/guardian/WardSwitcher";
import {
  useGuardianClubsQuery,
  useGuardianHousesQuery,
} from "@/features/guardian/queries";
import { spacing, type, useTheme } from "@/theme/theme";

export default function GuardianMoreScreen() {
  const { activeWard } = useGuardian();
  const clubs = useGuardianClubsQuery();
  const houses = useGuardianHousesQuery();
  const { colors } = useTheme();
  const retry = () => void Promise.all([clubs.refetch(), houses.refetch()]);
  return (
    <Screen
      title="More"
      subtitle="Learning and school community"
      right={<WardSwitcher />}
      refreshing={clubs.isRefetching || houses.isRefetching}
      onRefresh={retry}
    >
      <View style={{ gap: spacing.lg }}>
        <Card>
          <ListRow
            title="Attendance history"
            subtitle="Term summary and daily records"
            leading={<CalendarDays size={20} color={colors.primary} />}
            onPress={() =>
              router.push("/(guardian)/attendance-history" as Href)
            }
            divider
          />
          <ListRow
            title="Weekly timetable"
            subtitle="Class schedule by day"
            leading={<BookOpen size={20} color={colors.primary} />}
            onPress={() => router.push("/(guardian)/timetable" as Href)}
            divider
          />
          <ListRow
            title="Published reports"
            subtitle="Academic report cards and internal mocks"
            leading={<ClipboardList size={20} color={colors.primary} />}
            onPress={() => router.push("/(guardian)/reports" as Href)}
          />
        </Card>
        {!activeWard ? (
          <EmptyState
            title="No child selected"
            message="Link a child to view their school community."
            hue="violet"
          />
        ) : (
          <>
            <Card>
              <Text
                style={[
                  type.headline,
                  { color: colors.foreground, marginBottom: spacing.sm },
                ]}
              >
                Clubs
              </Text>
              {clubs.isPending ? (
                <SkeletonRow />
              ) : clubs.isError ? (
                <ErrorState
                  title="Unable to load clubs"
                  message="Check your connection and try again."
                  actionLabel="Retry"
                  onAction={retry}
                  hue="violet"
                />
              ) : clubs.data?.length ? (
                clubs.data
                  .filter((club) => club.isActive)
                  .map((club, index, entries) => (
                    <ListRow
                      key={club.id}
                      title={club.name}
                      subtitle={
                        club.description ?? `${club._count.members} members`
                      }
                      leading={<UsersRound size={18} color={colors.primary} />}
                      status={
                        club._count.members
                          ? `${club._count.members} members`
                          : undefined
                      }
                      divider={index < entries.length - 1}
                      hue="violet"
                    />
                  ))
              ) : (
                <Text style={[type.body, { color: colors.mutedForeground }]}>
                  No active clubs are listed.
                </Text>
              )}
            </Card>
            <Card>
              <Text
                style={[
                  type.headline,
                  { color: colors.foreground, marginBottom: spacing.sm },
                ]}
              >
                Houses
              </Text>
              {houses.isPending ? (
                <SkeletonRow />
              ) : houses.isError ? (
                <ErrorState
                  title="Unable to load houses"
                  message="Check your connection and try again."
                  actionLabel="Retry"
                  onAction={retry}
                  hue="amber"
                />
              ) : houses.data?.length ? (
                houses.data.map((house, index, entries) => (
                  <ListRow
                    key={house.id}
                    title={house.name}
                    leading={<Home size={18} color={colors.primary} />}
                    subtitle={
                      house._count
                        ? `${house._count.students} students`
                        : undefined
                    }
                    divider={index < entries.length - 1}
                    hue="amber"
                  />
                ))
              ) : (
                <Text style={[type.body, { color: colors.mutedForeground }]}>
                  No school houses are listed.
                </Text>
              )}
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}
