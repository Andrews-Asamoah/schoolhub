import { BookOpen } from "lucide-react-native";
import { View } from "react-native";
import { Card } from "@/components/Surface";
import { EmptyState, ErrorState } from "@/components/States";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { SkeletonRow } from "@/components/Skeleton";
import { Text } from "@/components/Typography";
import { StudentBackButton } from "@/features/student/BackButton";
import { useMySubjectsQuery } from "@/features/student/queries";
import { spacing, type, useTheme } from "@/theme/theme";

export default function StudentSubjectsScreen() {
  const query = useMySubjectsQuery();
  const { colors } = useTheme();
  return (
    <Screen
      title="Subjects"
      subtitle={query.data?.class?.name ?? "Your current class"}
      left={<StudentBackButton />}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
    >
      <View style={{ gap: spacing.lg }}>
        {query.isPending ? (
          <Card>
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </Card>
        ) : query.isError ? (
          <ErrorState
            title="Unable to load subjects"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => void query.refetch()}
            hue="violet"
          />
        ) : !query.data.subjects.length ? (
          <EmptyState
            title="No subjects assigned"
            message="Subjects for your current class will appear here."
            icon={<BookOpen size={32} color={colors.mutedForeground} />}
            hue="violet"
          />
        ) : (
          <Card>
            {query.data.subjects.map((subject, index, entries) => (
              <ListRow
                key={subject.subjectId}
                title={subject.name}
                subtitle={[
                  subject.code,
                  subject.teacherName,
                  subject.periodsPerWeek == null
                    ? null
                    : `${subject.periodsPerWeek} periods per week`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                leading={<BookOpen size={19} color={colors.primary} />}
                status={subject.isCompulsory ? "Core" : "Elective"}
                divider={index < entries.length - 1}
                hue="violet"
              />
            ))}
          </Card>
        )}
        {query.data?.class?.level ? (
          <Text style={[type.caption, { color: colors.mutedForeground }]}>
            Class level: {query.data.class.level}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
