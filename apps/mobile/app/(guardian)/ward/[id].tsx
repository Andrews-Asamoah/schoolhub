import { router, type Href, useLocalSearchParams } from "expo-router";
import {
  BookOpen,
  CalendarDays,
  ClipboardList,
  UsersRound,
} from "lucide-react-native";
import { View } from "react-native";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SkeletonHero, SkeletonRow } from "@/components/Skeleton";
import { Text } from "@/components/Typography";
import { GuardianBackButton } from "@/features/guardian/BackButton";
import { useMyWardQuery } from "@/features/guardian/queries";
import { useGuardian } from "@/features/guardian/context";
import { useEffect } from "react";
import { spacing, type, useTheme } from "@/theme/theme";

export default function WardProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useMyWardQuery(id ?? "");
  const { selectWard } = useGuardian();
  const { colors } = useTheme();
  useEffect(() => {
    if (id) selectWard(id);
  }, [id, selectWard]);
  const ward = query.data;
  const name = ward
    ? [ward.profile.firstName, ward.profile.otherNames, ward.profile.lastName]
        .filter(Boolean)
        .join(" ")
    : "Child profile";

  return (
    <Screen
      title={name}
      subtitle={ward?.class?.name ?? "Student profile"}
      left={<GuardianBackButton />}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <View style={{ gap: spacing.lg }}>
        {query.isPending ? (
          <>
            <SkeletonHero />
            <Card>
              <SkeletonRow />
              <SkeletonRow />
            </Card>
          </>
        ) : query.isError ? (
          <ErrorState
            title="Unable to load this profile"
            message="The child profile could not be loaded."
            actionLabel="Retry"
            onAction={() => void query.refetch()}
          />
        ) : !ward ? (
          <EmptyState
            title="Profile unavailable"
            message="This child may no longer be linked to your account."
            hue="violet"
          />
        ) : (
          <>
            <Card>
              <Text
                style={[
                  type.headline,
                  { color: colors.foreground, marginBottom: spacing.md },
                ]}
              >
                School details
              </Text>
              <ListRow
                title="Admission number"
                subtitle={ward.admissionNumber ?? "Not recorded"}
                divider
              />
              <ListRow
                title="Class"
                subtitle={ward.class?.name ?? "Not assigned"}
                divider
              />
              <ListRow
                title="Department"
                subtitle={ward.department?.name ?? "Not assigned"}
                divider
              />
              <ListRow
                title="House"
                subtitle={ward.house?.name ?? "Not assigned"}
              />
            </Card>
            <Card>
              <ListRow
                title="Attendance"
                subtitle="Term summary and recent records"
                leading={<CalendarDays size={20} color={colors.primary} />}
                onPress={() => {
                  selectWard(ward.id);
                  router.push("/(guardian)/attendance-history" as Href);
                }}
                divider
              />
              <ListRow
                title="Timetable"
                subtitle="Weekly class schedule"
                leading={<BookOpen size={20} color={colors.primary} />}
                onPress={() => {
                  selectWard(ward.id);
                  router.push("/(guardian)/timetable" as Href);
                }}
                divider
              />
              <ListRow
                title="Published reports"
                subtitle="Academic and mock report cards"
                leading={<ClipboardList size={20} color={colors.primary} />}
                onPress={() => router.push("/(guardian)/reports" as Href)}
              />
            </Card>
            <Card>
              <Text
                style={[
                  type.headline,
                  { color: colors.foreground, marginBottom: spacing.md },
                ]}
              >
                Current subjects
              </Text>
              {ward.subjects.length ? (
                ward.subjects.map((subject, index) => (
                  <ListRow
                    key={subject.subjectId}
                    title={subject.name}
                    subtitle={`${subject.code}${subject.teacherName ? ` · ${subject.teacherName}` : ""}`}
                    leading={<UsersRound size={18} color={colors.primary} />}
                    divider={index < ward.subjects.length - 1}
                  />
                ))
              ) : (
                <Text style={[type.body, { color: colors.mutedForeground }]}>
                  No current class subjects are available.
                </Text>
              )}
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}
