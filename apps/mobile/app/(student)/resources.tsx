import { router, type Href } from "expo-router";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardList,
  LockKeyhole,
  MessageCircle,
  Megaphone,
  Settings,
  UsersRound,
} from "lucide-react-native";
import { View } from "react-native";
import { Card } from "@/components/Surface";
import { ListRow } from "@/components/ListRow";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Typography";
import { spacing, type, useTheme } from "@/theme/theme";

export default function StudentResourcesScreen() {
  const { colors } = useTheme();
  return (
    <Screen title="More" subtitle="Learning and school resources">
      <View style={{ gap: spacing.lg }}>
        <Card>
          <Text
            accessibilityRole="header"
            style={[
              type.headline,
              { color: colors.foreground, marginBottom: spacing.sm },
            ]}
          >
            Student resources
          </Text>
          <ListRow
            title="My subjects"
            subtitle="Subjects for your current class"
            leading={<BookOpen size={20} color={colors.primary} />}
            onPress={() => router.push("/(student)/student-subjects" as Href)}
            divider
          />
          <ListRow
            title="Classmates"
            subtitle="Students in your current class"
            leading={<UsersRound size={20} color={colors.primary} />}
            onPress={() => router.push("/(student)/student-classmates" as Href)}
            divider
          />
          <ListRow
            title="Clubs and houses"
            subtitle="Explore your school community"
            leading={<UsersRound size={20} color={colors.primary} />}
            onPress={() => router.push("/(student)/student-community" as Href)}
            divider
          />
          <ListRow
            title="Reports"
            subtitle="Assessment progress and published results"
            leading={<ClipboardList size={20} color={colors.primary} />}
            onPress={() => router.push("/(student)/student-reports" as Href)}
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
            School and account
          </Text>
          <ListRow
            title="Announcements"
            subtitle="Notices from your school"
            leading={<Megaphone size={20} color={colors.primary} />}
            onPress={() => router.push("/(shared)/announcements" as Href)}
            divider
          />
          <ListRow
            title="Notifications"
            subtitle="Messages and account updates"
            leading={<Bell size={20} color={colors.primary} />}
            onPress={() => router.push("/(shared)/notifications" as Href)}
            divider
          />
          <ListRow
            title="Messages"
            subtitle="School communication"
            leading={<MessageCircle size={20} color={colors.primary} />}
            onPress={() => router.push("/(shared)/messages" as Href)}
            divider
          />
          <ListRow
            title="Academic context"
            subtitle="Current school year and term"
            leading={<CalendarDays size={20} color={colors.primary} />}
            onPress={() => router.push("/(shared)/academic-context" as Href)}
            divider
          />
          <ListRow
            title="Profile and settings"
            subtitle="Account, appearance and personal details"
            leading={<Settings size={20} color={colors.primary} />}
            onPress={() => router.push("/(shared)/profile" as Href)}
            divider
          />
          <ListRow
            title="Security"
            subtitle="Password and account safety"
            leading={<LockKeyhole size={20} color={colors.primary} />}
            onPress={() => router.push("/(shared)/security" as Href)}
          />
        </Card>
      </View>
    </Screen>
  );
}
