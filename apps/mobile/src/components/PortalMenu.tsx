import { router, type Href } from "expo-router";
import {
  Bell,
  CalendarDays,
  LockKeyhole,
  MessageCircle,
  UserRound,
  type LucideIcon,
} from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { ListRow } from "@/components/ListRow";
import { Surface } from "@/components/Surface";
import { Text } from "@/components/Typography";
import { modulePalette, type Hue } from "@/theme/palette";
import { spacing, type, useTheme } from "@/theme/theme";

type MenuLink = {
  label: string;
  icon: LucideIcon;
  href: Href;
  detail?: string;
  status?: string;
};

export function PortalMenu({
  title,
  links,
  hue = "indigo",
}: {
  title: string;
  links: readonly MenuLink[];
  hue?: Hue;
}) {
  const { colors, scheme } = useTheme();
  const palette = modulePalette(hue, scheme);
  return (
    <View style={styles.section}>
      <Text
        accessibilityRole="header"
        style={[type.headline, styles.heading, { color: colors.foreground }]}
      >
        {title}
      </Text>
      <Surface padding={0}>
        {links.map(({ label, detail, href, icon: Icon, status }, index) => (
          <View key={label} style={styles.row}>
            <ListRow
              title={label}
              subtitle={detail}
              hue={hue}
              status={status}
              leading={<Icon size={20} color={palette.ink} />}
              onPress={() => router.push(href)}
              chevron
              divider={index < links.length - 1}
            />
          </View>
        ))}
      </Surface>
    </View>
  );
}

export function SchoolAccountMenu({
  unread,
  messagesHref,
}: {
  unread?: number;
  messagesHref: Href;
}) {
  return (
    <>
      <PortalMenu
        title="Communication"
        hue="sky"
        links={[
          {
            label: "Messages",
            href: messagesHref,
            icon: MessageCircle,
          },
          {
            label: "Notifications",
            href: "/(shared)/notifications",
            icon: Bell,
            status: unread ? `${unread} unread` : undefined,
          },
        ]}
      />
      <PortalMenu
        title="Account"
        hue="indigo"
        links={[
          {
            label: "Profile and settings",
            href: "/(shared)/profile",
            icon: UserRound,
          },
          {
            label: "Academic context",
            href: "/(shared)/academic-context",
            icon: CalendarDays,
          },
          { label: "Security", href: "/(shared)/security", icon: LockKeyhole },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  heading: { paddingHorizontal: spacing.xs },
  row: { paddingHorizontal: spacing.md },
});
