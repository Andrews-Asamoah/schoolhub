import { router, type Href } from "expo-router";
import {
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  Megaphone,
} from "lucide-react-native";
import { View } from "react-native";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { HeroCard } from "@/components/HeroCard";
import { ListRow } from "@/components/ListRow";
import { ProgressRing } from "@/components/Charts";
import { Screen } from "@/components/Screen";
import { SkeletonHero, SkeletonRow } from "@/components/Skeleton";
import { Text } from "@/components/Typography";
import { useAnnouncementsQuery } from "@/features/announcements/queries";
import { useGuardian } from "@/features/guardian/context";
import { WardSwitcher } from "@/features/guardian/WardSwitcher";
import {
  useWardAttendanceQuery,
  useWardFeesQuery,
  useWardTimetableQuery,
} from "@/features/guardian/queries";
import { formatDateTime } from "@/features/shared/format";
import { spacing, type, useTheme } from "@/theme/theme";

const days = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];
const money = (value: string | undefined) => {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "GHS",
      }).format(amount)
    : "—";
};
const childName = (
  ward: NonNullable<ReturnType<typeof useGuardian>["activeWard"]>,
) =>
  [ward.profile.firstName, ward.profile.otherNames, ward.profile.lastName]
    .filter(Boolean)
    .join(" ");

export default function GuardianHomeScreen() {
  const {
    activeWard,
    isPending: wardsPending,
    isError: wardsError,
    refetch,
  } = useGuardian();
  const attendance = useWardAttendanceQuery(activeWard?.id ?? "");
  const fees = useWardFeesQuery(activeWard?.id ?? "");
  const timetable = useWardTimetableQuery(activeWard?.id ?? "");
  const notices = useAnnouncementsQuery();
  const { colors } = useTheme();
  const refresh = () => {
    void Promise.all([
      refetch(),
      attendance.refetch(),
      fees.refetch(),
      timetable.refetch(),
      notices.refetch(),
    ]);
  };
  const publishedNotices = (notices.data ?? [])
    .filter((item) => item.status === "PUBLISHED")
    .sort(
      (a, b) =>
        Number(b.isPinned) - Number(a.isPinned) ||
        b.createdAt.localeCompare(a.createdAt),
    );
  const latestNotice = publishedNotices[0];
  const today = days[new Date().getDay()];
  const todayEntries = (timetable.data?.entries ?? [])
    .filter((entry) => entry.dayOfWeek.toUpperCase() === today)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  return (
    <Screen
      title="Family"
      subtitle="Your child's school day at a glance"
      right={<WardSwitcher />}
      refreshing={
        attendance.isRefetching ||
        fees.isRefetching ||
        timetable.isRefetching ||
        notices.isRefetching
      }
      onRefresh={refresh}
    >
      <View style={{ gap: spacing.lg }}>
        {wardsPending ? (
          <SkeletonHero />
        ) : wardsError ? (
          <ErrorState
            title="Unable to load your children"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={refetch}
          />
        ) : !activeWard ? (
          <EmptyState
            title="No linked children"
            message="Children linked to your guardian account will appear here."
            hue="violet"
          />
        ) : (
          <>
            <HeroCard
              greeting={`Hello, ${childName(activeWard).split(" ")[0]}`}
              detail={activeWard.class?.name ?? "Class not assigned"}
            >
              <Text style={[type.body, { color: "#FFFFFF" }]}>
                {activeWard.profile.firstName}&apos;s school updates and
                progress
              </Text>
            </HeroCard>

            {attendance.isPending ? (
              <Card>
                <SkeletonRow />
              </Card>
            ) : attendance.isError ? (
              <ErrorState
                title="Attendance unavailable"
                message="Your child's attendance could not be loaded."
                actionLabel="Retry"
                onAction={() => void attendance.refetch()}
                hue="emerald"
              />
            ) : (
              <Card>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: spacing.lg,
                  }}
                >
                  <ProgressRing
                    label="Attendance"
                    value={attendance.data.attendanceRate}
                    hue="emerald"
                  />
                  <View style={{ flex: 1, gap: spacing.xs }}>
                    <Text style={[type.headline, { color: colors.foreground }]}>
                      This term
                    </Text>
                    <Text
                      style={[type.body, { color: colors.mutedForeground }]}
                    >
                      {attendance.data.totalDays} recorded{" "}
                      {attendance.data.totalDays === 1 ? "day" : "days"}
                    </Text>
                    <ListRow
                      title="Attendance history"
                      leading={
                        <CalendarDays size={18} color={colors.primary} />
                      }
                      onPress={() =>
                        router.push("/(guardian)/attendance-history" as Href)
                      }
                    />
                  </View>
                </View>
              </Card>
            )}

            {fees.isPending ? (
              <Card>
                <SkeletonRow />
              </Card>
            ) : fees.isError ? (
              <ErrorState
                title="Fee balance unavailable"
                message="The fee statement could not be loaded."
                actionLabel="Retry"
                onAction={() => void fees.refetch()}
                hue="emerald"
              />
            ) : (
              <Card>
                <ListRow
                  title="Fee balance"
                  subtitle="View-only statement"
                  leading={
                    <CircleDollarSign size={20} color={colors.primary} />
                  }
                  trailing={
                    <Text style={[type.headline, { color: colors.foreground }]}>
                      {money(fees.data.closingBalance)}
                    </Text>
                  }
                  onPress={() =>
                    router.push("/(guardian)/account-fees" as Href)
                  }
                />
              </Card>
            )}

            <Card>
              <ListRow
                title="Today's timetable"
                subtitle={timetable.data?.class?.name ?? "Class schedule"}
                leading={<CalendarDays size={20} color={colors.primary} />}
                trailing={
                  <ArrowRight size={18} color={colors.mutedForeground} />
                }
                onPress={() => router.push("/(guardian)/timetable" as Href)}
                divider
              />
              {timetable.isPending ? (
                <SkeletonRow />
              ) : timetable.isError ? (
                <ErrorState
                  title="Timetable unavailable"
                  message="The timetable could not be loaded."
                  actionLabel="Retry"
                  onAction={() => void timetable.refetch()}
                  hue="violet"
                />
              ) : todayEntries.length ? (
                todayEntries
                  .slice(0, 3)
                  .map((entry) => (
                    <ListRow
                      key={entry.id}
                      title={entry.subject?.name ?? entry.label}
                      subtitle={`${entry.startTime}–${entry.endTime}${entry.classroom?.name ? ` · ${entry.classroom.name}` : ""}`}
                    />
                  ))
              ) : (
                <Text
                  style={[
                    type.body,
                    {
                      color: colors.mutedForeground,
                      paddingVertical: spacing.md,
                    },
                  ]}
                >
                  No classes are scheduled for today.
                </Text>
              )}
            </Card>

            <Card>
              <ListRow
                title="Latest notice"
                leading={<Megaphone size={20} color={colors.primary} />}
                trailing={
                  <ArrowRight size={18} color={colors.mutedForeground} />
                }
                onPress={() => router.push("/(guardian)/notices" as Href)}
                divider
              />
              {notices.isPending ? (
                <SkeletonRow />
              ) : notices.isError ? (
                <ErrorState
                  title="Notices unavailable"
                  message="School announcements could not be loaded."
                  actionLabel="Retry"
                  onAction={() => void notices.refetch()}
                  hue="amber"
                />
              ) : latestNotice ? (
                <ListRow
                  title={latestNotice.title}
                  subtitle={`${latestNotice.category} · ${formatDateTime(latestNotice.createdAt)}`}
                  onPress={() =>
                    router.push(
                      `/(shared)/announcements/${encodeURIComponent(latestNotice.id)}` as Href,
                    )
                  }
                />
              ) : (
                <Text
                  style={[
                    type.body,
                    {
                      color: colors.mutedForeground,
                      paddingVertical: spacing.md,
                    },
                  ]}
                >
                  No published notices yet.
                </Text>
              )}
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}
