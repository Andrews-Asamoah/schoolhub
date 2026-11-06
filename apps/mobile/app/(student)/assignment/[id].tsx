import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { TextInput, View } from "react-native";
import { BookOpen, CheckCircle2 } from "lucide-react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SkeletonRow } from "@/components/Skeleton";
import { Text } from "@/components/Typography";
import { StudentBackButton } from "@/features/student/BackButton";
import { useSubmitAssignmentMutation } from "@/features/student/mutations";
import { useMyAssignmentsQuery } from "@/features/student/queries";
import { spacing, type, useTheme } from "@/theme/theme";

export default function StudentAssignmentScreen() {
  const { id: routeId } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(routeId) ? routeId[0] : routeId;
  const query = useMyAssignmentsQuery();
  const assignment = query.data?.assignments.find((item) => item.id === id);
  const mutation = useSubmitAssignmentMutation(id ?? "");
  const { colors } = useTheme();
  const [draft, setDraft] = useState<{
    assignmentId: string;
    text: string;
  } | null>(null);
  const responseText =
    assignment && draft?.assignmentId === assignment.id
      ? draft.text
      : (assignment?.submission?.responseText ?? "");

  const canSubmit =
    !!assignment &&
    assignment.submission?.status !== "GRADED" &&
    responseText.trim().length > 0 &&
    responseText.trim().length <= 20_000;

  return (
    <Screen
      title="Assignment"
      subtitle={assignment?.subject.name ?? "Assignment details"}
      left={<StudentBackButton />}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <View style={{ gap: spacing.lg }}>
        {query.isPending ? (
          <Card>
            <SkeletonRow />
            <SkeletonRow />
          </Card>
        ) : query.isError ? (
          <ErrorState
            title="Unable to load assignment"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => void query.refetch()}
            hue="orange"
          />
        ) : !assignment ? (
          <EmptyState
            title="Assignment not found"
            message="It may no longer be published for your current class."
            hue="orange"
          />
        ) : (
          <>
            <Card>
              <Text
                accessibilityRole="header"
                style={[
                  type.headline,
                  { color: colors.foreground, marginBottom: spacing.sm },
                ]}
              >
                {assignment.title}
              </Text>
              <Text style={[type.body, { color: colors.foreground }]}>
                {assignment.instructions}
              </Text>
              <View style={{ marginTop: spacing.md }}>
                <ListRow
                  title="Subject"
                  subtitle={`${assignment.subject.name} · ${assignment.teacher.name}`}
                  leading={<BookOpen size={19} color={colors.primary} />}
                  divider
                />
                <ListRow
                  title="Due date"
                  subtitle={
                    assignment.dueAt
                      ? new Date(assignment.dueAt).toLocaleString()
                      : "No due date set"
                  }
                  status={assignment.submission?.status ?? "Not submitted"}
                  hue={
                    assignment.submission?.status === "GRADED"
                      ? "emerald"
                      : assignment.submission?.status === "SUBMITTED"
                        ? "sky"
                        : "amber"
                  }
                />
              </View>
            </Card>

            {assignment.submission ? (
              <Card>
                <Text
                  accessibilityRole="header"
                  style={[
                    type.headline,
                    { color: colors.foreground, marginBottom: spacing.sm },
                  ]}
                >
                  Your submission
                </Text>
                <Text style={[type.body, { color: colors.foreground }]}>
                  {assignment.submission.responseText}
                </Text>
                <Text
                  style={[
                    type.caption,
                    { color: colors.mutedForeground, marginTop: spacing.md },
                  ]}
                >
                  Submitted{" "}
                  {new Date(assignment.submission.submittedAt).toLocaleString()}
                </Text>
                {assignment.submission.status === "GRADED" ? (
                  <>
                    <Text
                      style={[
                        type.bodyStrong,
                        { color: colors.foreground, marginTop: spacing.md },
                      ]}
                    >
                      Score: {assignment.submission.score ?? "Not provided"}
                      {assignment.submission.score === null
                        ? ""
                        : ` / ${assignment.maxScore}`}
                    </Text>
                    {assignment.submission.feedback ? (
                      <Text
                        style={[
                          type.body,
                          {
                            color: colors.mutedForeground,
                            marginTop: spacing.sm,
                          },
                        ]}
                      >
                        {assignment.submission.feedback}
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </Card>
            ) : null}

            {assignment.submission?.status === "GRADED" ? (
              <Card>
                <ListRow
                  title="This assignment has been graded"
                  subtitle="A graded submission can no longer be changed."
                  leading={<CheckCircle2 size={20} color={colors.primary} />}
                />
              </Card>
            ) : (
              <Card>
                <Text
                  accessibilityRole="header"
                  style={[
                    type.headline,
                    { color: colors.foreground, marginBottom: spacing.sm },
                  ]}
                >
                  {assignment.submission
                    ? "Update your response"
                    : "Submit your response"}
                </Text>
                <TextInput
                  accessibilityLabel="Assignment response"
                  value={responseText}
                  onChangeText={(text) =>
                    setDraft({ assignmentId: assignment.id, text })
                  }
                  placeholder="Write your answer here"
                  placeholderTextColor={colors.mutedForeground}
                  multiline
                  maxLength={20_000}
                  textAlignVertical="top"
                  style={{
                    minHeight: 160,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 16,
                    padding: spacing.md,
                    color: colors.foreground,
                    backgroundColor: colors.card,
                    fontSize: 16,
                    lineHeight: 23,
                  }}
                />
                <Text
                  style={[
                    type.caption,
                    { color: colors.mutedForeground, textAlign: "right" },
                  ]}
                >
                  {responseText.length.toLocaleString()} / 20,000
                </Text>
                {mutation.isError ? (
                  <ErrorState
                    title="Submission failed"
                    message={
                      mutation.error instanceof Error
                        ? mutation.error.message
                        : "Your response could not be submitted."
                    }
                    hue="rose"
                  />
                ) : mutation.isSuccess ? (
                  <Text
                    accessibilityRole="alert"
                    style={[type.body, { color: colors.primary }]}
                  >
                    Your response was submitted.
                  </Text>
                ) : null}
                <Button
                  label={
                    assignment.submission
                      ? "Update submission"
                      : "Submit assignment"
                  }
                  loading={mutation.isPending}
                  disabled={!canSubmit || mutation.isPending}
                  onPress={() => {
                    if (canSubmit) mutation.mutate({ responseText });
                  }}
                />
              </Card>
            )}
          </>
        )}
      </View>
    </Screen>
  );
}
