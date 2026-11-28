import { useState } from "react";
import { SelectField } from "@/components/SelectField";
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

const submissionLabel = (
  status: string | null | undefined,
  dueAt: string | null,
) => {
  if (status === "GRADED") return "Graded";
  if (status === "SUBMITTED") return "Submitted";
  return dueAt && Date.parse(dueAt) < Date.now() ? "Overdue" : "To do";
};

export default function StudentLearningScreen() {
  const [filter, setFilter] = useState("all");
  const assignments = useMyAssignmentsQuery();
  const subjects = useMySubjectsQuery();
  const { colors } = useTheme();
  const refresh = () => {
    void Promise.all([assignments.refetch(), subjects.refetch()]);
  };
  const assignmentRows = assignments.data?.assignments ?? [];
  const states = ["all", "todo", "submitted", "graded"];
  const stateOf = (row: (typeof assignmentRows)[number]) =>
    row.submission?.status?.toLowerCase() ?? "todo";
  const filtered = assignmentRows.filter(
    (row) => filter === "all" || stateOf(row) === filter,
  );
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
            <>
              <SelectField
                label="Assignment status"
                value={filter}
                options={states.map((value, index) => ({
                  value,
                  label: `${["All", "To do", "Submitted", "Graded"][index]} (${assignmentRows.filter((row) => value === "all" || stateOf(row) === value).length})`,
                }))}
                onChange={setFilter}
              />
              {!filtered.length ? (
                <Text>No assignments match this status.</Text>
              ) : null}
              {filtered.map((assignment, index) => (
                <ListRow
                  key={assignment.id}
                  title={assignment.title}
                  subtitle={`${assignment.subject.name}${assignment.dueAt ? ` · Due ${new Date(assignment.dueAt).toLocaleDateString()}` : ""}`}
                  leading={<ClipboardList size={19} color={colors.primary} />}
                  status={submissionLabel(
                    assignment.submission?.status,
                    assignment.dueAt,
                  )}
                  hue={
                    assignment.submission?.status === "GRADED"
                      ? "emerald"
                      : assignment.submission?.status === "SUBMITTED"
                        ? "sky"
                        : "amber"
                  }
                  divider={index < filtered.length - 1}
                  onPress={() =>
                    router.push(
                      `/(student)/assignment/${encodeURIComponent(assignment.id)}` as Href,
                    )
                  }
                />
              ))}
            </>
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
