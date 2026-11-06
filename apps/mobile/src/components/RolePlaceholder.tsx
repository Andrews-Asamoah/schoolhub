import { router, type Href } from "expo-router";
import {
  Bell,
  BookOpenText,
  CalendarDays,
  Mail,
  Shield,
  UserRound,
} from "lucide-react-native";
import { View } from "react-native";
import { ListRow } from "@/components/ListRow";
import { Card } from "@/components/Surface";
import { Text } from "@/components/Typography";
import { Screen } from "./Screen";
import { Button } from "./Button";
import { ROLE_LABELS } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { signOut } from "@/lib/sign-out";
import { type, useTheme } from "@/theme/theme";
import { useToast } from "./Toast";
import { useNotificationsQuery } from "@/features/shared/queries";
export function RolePlaceholder() {
  const { activeRole } = useSession();
  const { colors, tenant } = useTheme();
  const { show } = useToast();
  const notifications = useNotificationsQuery();
  return (
    <Screen
      title={activeRole ? ROLE_LABELS[activeRole] : "SchoolHub"}
      subtitle={tenant?.name}
    >
      <View style={{ gap: 16 }}>
        <Text style={[type.body, { color: colors.foreground }]}>
          Your shared SchoolHub tools are ready. Role-specific learning
          workspaces are being prepared.
        </Text>
        <Card>
          <ListRow
            title="Updates"
            subtitle="Notifications and delivery preferences"
            leading={<Bell size={20} color={colors.primary} />}
            status={
              notifications.data?.unreadCount
                ? `${notifications.data.unreadCount} unread`
                : undefined
            }
            hue="rose"
            chevron
            onPress={() => router.push("/(shared)/notifications" as Href)}
            divider
          />
          <ListRow
            title="Messages"
            subtitle="School inbox and compose"
            leading={<Mail size={20} color={colors.primary} />}
            chevron
            onPress={() => router.push("/(shared)/messages" as Href)}
            divider
          />
          <ListRow
            title="Announcements"
            subtitle="Notices for your school community"
            leading={<BookOpenText size={20} color={colors.primary} />}
            chevron
            onPress={() => router.push("/(shared)/announcements" as Href)}
            divider
          />
          <ListRow
            title="Academic calendar"
            subtitle="Current school year and term"
            leading={<CalendarDays size={20} color={colors.primary} />}
            chevron
            onPress={() => router.push("/(shared)/academic-context" as Href)}
            divider
          />
          <ListRow
            title="Profile & settings"
            subtitle="Personal details and app appearance"
            leading={<UserRound size={20} color={colors.primary} />}
            chevron
            onPress={() => router.push("/(shared)/profile" as Href)}
            divider
          />
          <ListRow
            title="Security"
            subtitle="Password and sign-in options"
            leading={<Shield size={20} color={colors.primary} />}
            chevron
            onPress={() => router.push("/(shared)/security" as Href)}
          />
        </Card>
        <Button
          label="Sign out"
          onPress={() =>
            void signOut().catch(() =>
              show({
                message: "Unable to complete sign-out. Please restart the app.",
                tone: "error",
              }),
            )
          }
        />
      </View>
    </Screen>
  );
}
