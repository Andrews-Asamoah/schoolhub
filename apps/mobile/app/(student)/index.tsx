import { router, type Href } from "expo-router";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Clock3,
  GraduationCap,
} from "lucide-react-native";
import { View } from "react-native";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { HeroCard } from "@/components/HeroCard";
import { ListRow } from "@/components/ListRow";
import { StatusPill } from "@/components/ModulePrimitives";
import { ProgressRing } from "@/components/Charts";
import { Screen } from "@/components/Screen";
import { SkeletonHero, SkeletonRow } from "@/components/Skeleton";
import { Text } from "@/components/Typography";
import { useAnnouncementsQuery } from "@/features/announcements/queries";
import {
  useMyAssignmentsQuery,
  useMyAttendanceQuery,
  useMyFeeStatusQuery,
  useMyStudentProfileQuery,
  useMyTimetableQuery,
} from "@/features/student/queries";
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
const greetingName = (firstName: string) =>
  firstName.trim().split(/\s+/)[0] || "Student";

export default function StudentHomeScreen() {
  const profile = useMyStudentProfileQuery();
  const fees = useMyFeeStatusQuery();
  const timetable = useMyTimetableQuery();
  const attendance = useMyAttendanceQuery();
  const assignments = useMyAssignmentsQuery();
  const announcements = useAnnouncementsQuery();
  const { colors } = useTheme();
  const refresh = () => {
    void Promise.all([
      profile.refetch(),
      fees.refetch(),
      timetable.refetch(),
      attendance.refetch(),
      assignments.refetch(),
      announcements.refetch(),
    ]);
  };
  const today = days[new Date().getDay()];
  const todayEntries = (timetable.data?.entries ?? [])
    .filter((entry) => entry.dayOfWeek.toUpperCase() === today)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const latestAssignment = assignments.data?.assignments.find(
    (assignment) =>
      assignment.submission?.status !== "GRADED" &&
      assignment.submission?.status !== "SUBMITTED",
  );
  const latestNotice = (announcements.data ?? [])
    .filter((notice) => notice.status === "PUBLISHED")
    .sort(
      (a, b) =>
        Number(b.isPinned) - Number(a.isPinned) ||
        b.createdAt.localeCompare(a.createdAt),
    )[0];
  const loading = profile.isPending;
  const failed = profile.isError;

  return (
    <Screen
      title="Home"
      subtitle="Your school day at a glance"
      refreshing={
        profile.isRefetching ||
        fees.isRefetching ||
        timetable.isRefetching ||
        attendance.isRefetching ||
        assignments.isRefetching ||
        announcements.isRefetching
      }
      onRefresh={refresh}
    >
      <View style={{ gap: spacing.lg }}>
        {loading ? (
          <SkeletonHero />
        ) : failed ? (
          <ErrorState
            title="Unable to load your profile"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={refresh}
          />
        ) : profile.data ? (
          <>
            <HeroCard
              greeting={`Hello, ${greetingName(profile.data.profile.firstName)}`}
              detail={
                [profile.data.class?.name, profile.data.house?.name]
                  .filter(Boolean)
                  .join(" · ") || "Your student dashboard"
              }
            >
              <Text style={[type.body, { color: "#FFFFFF" }]}>
                Keep up with classes, assignments and school updates.
              </Text>
            </HeroCard>

            <Card>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: spacing.lg,
                }}
              >
                {attendance.isPending ? (
                  <View style={{ flex: 1 }}>
                    <SkeletonRow />
                  </View>
                ) : attendance.isError ? (
                  <View style={{ flex: 1 }}>
                    <ErrorState
                      title="Attendance unavailable"
                      message="Your summary could not be loaded."
                      actionLabel="Retry"
                      onAction={() => void attendance.refetch()}
                      hue="emerald"
                    />
                  </View>
                ) : attendance.data?.attendanceRate !== null &&
                  attendance.data ? (
                  <ProgressRing
                    label="Attendance"
                    value={attendance.data.attendanceRate}
                    hue="emerald"
                  />
                ) : (
                  <Text
                    style={[
                      type.caption,
                      { color: colors.mutedForeground, textAlign: "center" },
                    ]}
                  >
                    Attendance rate unavailable
                  </Text>
                )}
                <View style={{ flex: 1, gap: spacing.sm }}>
                  <Text style={[type.headline, { color: colors.foreground }]}>
                    This term
                  </Text>
                  {attendance.data ? (
                    <Text
                      style={[type.body, { color: colors.mutedForeground }]}
                    >
                      {attendance.data.recordedDays} days recorded
                    </Text>
                  ) : null}
                  {fees.isPending ? (
                    <SkeletonRow />
                  ) : fees.isError ? (
                    <ListRow
                      title="Fee status unavailable"
                      subtitle="Tap to retry"
                      onPress={() => void fees.refetch()}
                    />
                  ) : fees.data ? (
                    <View style={{ gap: spacing.xs }}>
                      <Text
                        style={[
                          type.caption,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        Fee status
                      </Text>
                      <StatusPill
                        label={fees.data.label}
                        hue={
                          fees.data.status === "FULLY_PAID"
                            ? "emerald"
                            : fees.data.status === "UNKNOWN"
                              ? "indigo"
                              : "amber"
                        }
                      />
                    </View>
                  ) : null}
                </View>
              </View>
            </Card>

            <Card>
              <ListRow
                title="Today's timetable"
                subtitle={
                  timetable.data?.class?.name ??
                  profile.data.class?.name ??
                  "Class schedule"
                }
                leading={<CalendarDays size={20} color={colors.primary} />}
                trailing={
                  <ArrowRight size={18} color={colors.mutedForeground} />
                }
                onPress={() => router.push("/(student)/my-timetable" as Href)}
                divider
              />
              {timetable.isPending ? (
                <SkeletonRow />
              ) : timetable.isError ? (
                <ErrorState
                  title="Timetable unavailable"
                  message="Your timetable could not be loaded."
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
                title="Assignments"
                subtitle={assignments.data?.term?.name ?? "Current term"}
                leading={<BookOpen size={20} color={colors.primary} />}
                trailing={
                  <ArrowRight size={18} color={colors.mutedForeground} />
                }
                onPress={() => router.push("/(student)/my-learning" as Href)}
                divider
              />
              {assignments.isPending ? (
                <SkeletonRow />
              ) : assignments.isError ? (
                <ErrorState
                  title="Assignments unavailable"
                  message="Your assignments could not be loaded."
                  actionLabel="Retry"
                  onAction={() => void assignments.refetch()}
                  hue="orange"
                />
              ) : latestAssignment ? (
                <ListRow
                  title={latestAssignment.title}
                  subtitle={`${latestAssignment.subject.name}${latestAssignment.dueAt ? ` · Due ${new Date(latestAssignment.dueAt).toLocaleDateString()}` : ""}`}
                  leading={<Clock3 size={18} color={colors.primary} />}
                  onPress={() =>
                    router.push(
                      `/(student)/assignment/${encodeURIComponent(latestAssignment.id)}` as Href,
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
                  No assignments need your attention.
                </Text>
              )}
            </Card>

            <Card>
              <ListRow
                title="Latest school notice"
                leading={<GraduationCap size={20} color={colors.primary} />}
                trailing={
                  <ArrowRight size={18} color={colors.mutedForeground} />
                }
                onPress={() => router.push("/(shared)/announcements" as Href)}
                divider
              />
              {announcements.isPending ? (
                <SkeletonRow />
              ) : announcements.isError ? (
                <ErrorState
                  title="Notices unavailable"
                  message="School announcements could not be loaded."
                  actionLabel="Retry"
                  onAction={() => void announcements.refetch()}
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
        ) : (
          <EmptyState
            title="Student profile unavailable"
            message="Ask your school to link a student record to your account."
          />
        )}
      </View>
    </Screen>
  );
}
