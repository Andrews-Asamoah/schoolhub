import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  FileText,
} from "lucide-react-native";
import { Text, View } from "react-native";
import { Card } from "@/components/Surface";
import { ListRow } from "@/components/ListRow";
import { WorkspaceScreen } from "@/components/WorkspaceScreen";
import { type, useTheme } from "@/theme/theme";

export default function LearningScreen() {
  const { colors, accent } = useTheme();
  return (
    <WorkspaceScreen
      title="My learning"
      subtitle="Assignments, resources and progress"
    >
      <Card padding={16} style={{ marginBottom: 18 }}>
        <Text style={[type.caption, { color: colors.mutedForeground }]}>
          Learning progress · Sample student
        </Text>
        <Text
          style={{
            color: colors.foreground,
            fontSize: 28,
            fontFamily: "Inter_700Bold",
            marginTop: 5,
          }}
        >
          7 of 10
        </Text>
        <Text
          style={[
            type.caption,
            { color: colors.mutedForeground, marginTop: 3 },
          ]}
        >
          Assignments completed this week
        </Text>
        <View
          style={{
            height: 8,
            borderRadius: 8,
            backgroundColor: colors.muted,
            overflow: "hidden",
            marginTop: 14,
          }}
        >
          <View
            style={{
              height: 8,
              width: "70%",
              borderRadius: 8,
              backgroundColor: accent,
            }}
          />
        </View>
      </Card>
      <Text
        style={[type.headline, { color: colors.foreground, marginBottom: 12 }]}
      >
        Upcoming assignments
      </Text>
      <Card padding={12} style={{ marginBottom: 18 }}>
        <ListRow
          leading={<FileText size={20} color={accent} />}
          title="Fractions and percentages"
          subtitle="Mathematics · Due Thursday"
          trailing={
            <Text style={{ color: colors.warning, fontSize: 12 }}>
              Due soon
            </Text>
          }
          divider
        />
        <ListRow
          leading={<FileText size={20} color={accent} />}
          title="Energy transformation worksheet"
          subtitle="Integrated Science · Due Friday"
          trailing={
            <Text style={{ color: colors.info, fontSize: 12 }}>To do</Text>
          }
        />
      </Card>
      <Text
        style={[type.headline, { color: colors.foreground, marginBottom: 12 }]}
      >
        Learning resources
      </Text>
      <Card padding={12}>
        <ListRow
          leading={<BookOpen size={20} color={accent} />}
          title="Revision notes: Algebra"
          subtitle="Mathematics · Reading material"
          trailing={<CheckCircle2 size={17} color={colors.success} />}
          divider
        />
        <ListRow
          leading={<CalendarClock size={20} color={accent} />}
          title="Science practical preparation"
          subtitle="Integrated Science · Study guide"
          trailing={
            <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
              8 min
            </Text>
          }
        />
      </Card>
      <Text
        style={[type.caption, { color: colors.mutedForeground, marginTop: 14 }]}
      >
        Sample learning content only. Submissions, downloads and grading are not
        active.
      </Text>
    </WorkspaceScreen>
  );
}
