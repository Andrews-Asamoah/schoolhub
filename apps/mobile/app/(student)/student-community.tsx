import { Home, UsersRound } from "lucide-react-native";
import { View } from "react-native";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SkeletonRow } from "@/components/Skeleton";
import { Text } from "@/components/Typography";
import {
  useMyClubsQuery,
  useSchoolClubsQuery,
  useSchoolHousesQuery,
} from "@/features/student/queries";
import { StudentBackButton } from "@/features/student/BackButton";
import { spacing, type, useTheme } from "@/theme/theme";

export default function StudentCommunityScreen() {
  const joined = useMyClubsQuery();
  const clubs = useSchoolClubsQuery();
  const houses = useSchoolHousesQuery();
  const { colors } = useTheme();
  const activeClubs = clubs.data?.filter((club) => club.isActive) ?? [];
  const retry = () =>
    void Promise.all([joined.refetch(), clubs.refetch(), houses.refetch()]);
  return (
    <Screen
      title="Community"
      subtitle="Clubs and houses"
      left={<StudentBackButton />}
      refreshing={
        joined.isRefetching || clubs.isRefetching || houses.isRefetching
      }
      onRefresh={retry}
    >
      <View style={{ gap: spacing.lg }}>
        <Card>
          <Text
            accessibilityRole="header"
            style={[
              type.headline,
              { color: colors.foreground, marginBottom: spacing.sm },
            ]}
          >
            My clubs
          </Text>
          {joined.isPending ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : joined.isError ? (
            <ErrorState
              title="Unable to load your clubs"
              message="Check your connection and try again."
              actionLabel="Retry"
              onAction={() => void joined.refetch()}
              hue="violet"
            />
          ) : joined.data?.length ? (
            joined.data.map((membership, index, entries) => (
              <ListRow
                key={membership.membershipId}
                title={membership.club.name}
                subtitle={
                  membership.club.description ??
                  `Member since ${new Date(membership.joinedAt).toLocaleDateString()}`
                }
                leading={<UsersRound size={19} color={colors.primary} />}
                status={membership.role}
                divider={index < entries.length - 1}
                hue="violet"
              />
            ))
          ) : (
            <EmptyState
              title="No club memberships"
              message="Your joined school clubs will appear here."
              hue="violet"
            />
          )}
        </Card>

        <Card>
          <Text
            accessibilityRole="header"
            style={[
              type.headline,
              { color: colors.foreground, marginBottom: spacing.sm },
            ]}
          >
            School clubs
          </Text>
          {clubs.isPending ? (
            <SkeletonRow />
          ) : clubs.isError ? (
            <ErrorState
              title="School clubs unavailable"
              message="The club directory could not be loaded."
              actionLabel="Retry"
              onAction={() => void clubs.refetch()}
              hue="violet"
            />
          ) : activeClubs.length ? (
            activeClubs.map((club, index, entries) => (
              <ListRow
                key={club.id}
                title={club.name}
                subtitle={club.description ?? `${club._count.members} members`}
                leading={<UsersRound size={19} color={colors.primary} />}
                status={`${club._count.members} members`}
                divider={index < entries.length - 1}
                hue="violet"
              />
            ))
          ) : (
            <Text style={[type.body, { color: colors.mutedForeground }]}>
              No active school clubs are listed.
            </Text>
          )}
        </Card>

        <Card>
          <Text
            accessibilityRole="header"
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
              title="Houses unavailable"
              message="The house list could not be loaded."
              actionLabel="Retry"
              onAction={() => void houses.refetch()}
              hue="amber"
            />
          ) : houses.data?.length ? (
            houses.data.map((house, index, entries) => (
              <ListRow
                key={house.id}
                title={house.name}
                leading={<Home size={19} color={colors.primary} />}
                subtitle={
                  house._count ? `${house._count.students} students` : undefined
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
      </View>
    </Screen>
  );
}
