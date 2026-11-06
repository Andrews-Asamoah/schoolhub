import { router, type Href } from "expo-router";
import { BookOpen, ClipboardList } from "lucide-react-native";
import { View } from "react-native";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SkeletonRow } from "@/components/Skeleton";
import { Text } from "@/components/Typography";
import {
  useMyAssignmentsQuery,
  useMySubjectsQuery,
} from "@/features/student/queries";
import { spacing, type, useTheme } from "@/theme/theme";

const submissionLabel = (status: string | null | undefined) => {
  if (status === "GRADED") return "Graded";
  if (status === "SUBMITTED") return "Submitted";
  return "To do";
};

export default function StudentLearningScreen() {
  const assignments = useMyAssignmentsQuery();
  const subjects = useMySubjectsQuery();
  const { colors } = useTheme();
  const refresh = () => {
    void Promise.all([assignments.refetch(), subjects.refetch()]);
  };
  const assignmentRows = assignments.data?.assignments ?? [];
  return (
    <Screen
      title="Learning"
      subtitle={assignments.data?.term?.name ?? "Assignments and subjects"}
      refreshing={assignments.isRefetching || subjects.isRefetching}
      onRefresh={refresh}
    >
      <View style={{ gap: spacing.lg }}>
        <Card>
          <ListRow
            title="My subjects"
            subtitle={
              subjects.data?.class?.name ?? "Subjects for your current class"
            }
            leading={<BookOpen size={20} color={colors.primary} />}
            status={
              subjects.data ? `${subjects.data.subjects.length}` : undefined
            }
            onPress={() => router.push("/(student)/student-subjects" as Href)}
          />
        </Card>
        <Card>
          <Text
            accessibilityRole="header"
            style={[
              type.headline,
              { color: colors.foreground, marginBottom: spacing.sm },
            ]}
          >
            Assignments
          </Text>
          {assignments.isPending ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : assignments.isError ? (
            <ErrorState
              title="Unable to load assignments"
              message="Check your connection and try again."
              actionLabel="Retry"
              onAction={() => void assignments.refetch()}
              hue="orange"
            />
          ) : assignmentRows.length ? (
            assignmentRows.map((assignment, index) => (
              <ListRow
                key={assignment.id}
                title={assignment.title}
                subtitle={`${assignment.subject.name}${assignment.dueAt ? ` · Due ${new Date(assignment.dueAt).toLocaleDateString()}` : ""}`}
                leading={<ClipboardList size={19} color={colors.primary} />}
                status={submissionLabel(assignment.submission?.status)}
                hue={
                  assignment.submission?.status === "GRADED"
                    ? "emerald"
                    : assignment.submission?.status === "SUBMITTED"
                      ? "sky"
                      : "amber"
                }
                divider={index < assignmentRows.length - 1}
                onPress={() =>
                  router.push(
                    `/(student)/assignment/${encodeURIComponent(assignment.id)}` as Href,
                  )
                }
              />
            ))
          ) : (
            <EmptyState
              title="No assignments yet"
              message="Published assignments for your current class will appear here."
              hue="orange"
            />
          )}
        </Card>
        {subjects.isError ? (
          <ErrorState
            title="Subjects unavailable"
            message="Your subject list could not be loaded."
            actionLabel="Retry"
            onAction={() => void subjects.refetch()}
            hue="violet"
          />
        ) : null}
        {subjects.isPending ? (
          <Card>
            <SkeletonRow />
          </Card>
        ) : null}
        {subjects.data?.subjects.length === 0 ? (
          <Text style={[type.caption, { color: colors.mutedForeground }]}>
            No subjects have been assigned to your current class.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
