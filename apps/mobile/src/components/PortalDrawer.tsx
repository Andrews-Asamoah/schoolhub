import { createContext, useContext, useState, type ReactNode } from "react";
import { router, type Href } from "expo-router";
import {
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Files,
  GraduationCap,
  Landmark,
  LockKeyhole,
  Megaphone,
  Menu,
  MessageCircle,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react-native";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type MobileRole } from "@/lib/permissions";
import { portalToolHref } from "@/lib/portal-tools";
import { radius, spacing, type, useTheme } from "@/theme/theme";
import { ListRow } from "./ListRow";
import { ModalOverlay } from "./ModalOverlay";
import { Text } from "./Typography";
import { PlatformLogo } from "./PlatformLogo";

type LinkItem = { label: string; href: Href; icon: LucideIcon };
const teacher: LinkItem[] = [
  {
    label: "Students",
    href: "/(teacher)/teacher-students",
    icon: GraduationCap,
  },
  { label: "Subjects", href: "/(teacher)/teacher-subjects", icon: BookOpen },
  {
    label: "Weekly timetable",
    href: "/(teacher)/teacher-timetable",
    icon: CalendarDays,
  },
  {
    label: "School reports",
    href: "/(teacher)/teacher-school-reports",
    icon: ClipboardList,
  },
  {
    label: "Report recommendations",
    href: "/(teacher)/teacher-report-review",
    icon: ClipboardCheck,
  },
  { label: "Clubs", href: "/(teacher)/teacher-clubs", icon: UsersRound },
  {
    label: "Staff documents",
    href: "/(teacher)/teacher-documents",
    icon: Files,
  },
];
const student: LinkItem[] = [
  { label: "Reports", href: "/(student)/student-reports", icon: ClipboardList },
  { label: "My subjects", href: "/(student)/student-subjects", icon: BookOpen },
  {
    label: "Classmates",
    href: "/(student)/student-classmates",
    icon: UsersRound,
  },
  {
    label: "Clubs and houses",
    href: "/(student)/student-community",
    icon: Landmark,
  },
];
const guardian: LinkItem[] = [
  {
    label: "Attendance history",
    href: "/(guardian)/attendance-history",
    icon: ClipboardCheck,
  },
  {
    label: "Absence requests",
    href: "/(guardian)/absence-requests",
    icon: Files,
  },
  {
    label: "Weekly timetable",
    href: "/(guardian)/timetable",
    icon: CalendarDays,
  },
  {
    label: "Published reports",
    href: "/(guardian)/reports",
    icon: ClipboardList,
  },
  { label: "Clubs and houses", href: "/(guardian)/more", icon: Landmark },
];
const roleItems = { teacher, student, guardian };

const DrawerContext = createContext<(() => void) | null>(null);
export const useOpenPortalDrawer = () => useContext(DrawerContext);

export function PortalDrawerProvider({
  role,
  children,
}: {
  role: MobileRole | null;
  children: ReactNode;
}) {
  const [openRole, setOpenRole] = useState<MobileRole | null>(null);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const show = () => setOpenRole(role);
  const hide = () => setOpenRole(null);
  const menu = role
    ? [
        {
          title: role === "teacher" ? "Teaching tools" : "School tools",
          links: roleItems[role],
        },
        {
          title: "Communication",
          links: [
            {
              label: "Messages",
              href: `/(${role})/${role}-messages` as Href,
              icon: MessageCircle,
            },
            {
              label: "Announcements",
              href: portalToolHref(role, "/announcements"),
              icon: Megaphone,
            },
            {
              label: "Notifications",
              href: portalToolHref(role, "/notifications"),
              icon: Bell,
            },
          ],
        },
        {
          title: "Account",
          links: [
            {
              label: "Profile and settings",
              href: portalToolHref(role, "/profile"),
              icon: UserRound,
            },
            {
              label: "Academic context",
              href: portalToolHref(role, "/academic-context"),
              icon: CalendarDays,
            },
            {
              label: "Security",
              href: portalToolHref(role, "/security"),
              icon: LockKeyhole,
            },
          ],
        },
      ]
    : [];

  return (
    <DrawerContext.Provider value={role ? show : null}>
      {children}
      {role && openRole === role ? (
        <ModalOverlay visible onDismiss={hide} placement="left">
          <ScrollView
            style={[styles.drawer, { backgroundColor: colors.card }]}
            contentContainerStyle={{
              paddingTop: insets.top + spacing.lg,
              paddingBottom: insets.bottom + spacing.lg,
              paddingHorizontal: spacing.lg,
            }}
          >
            <PlatformLogo />
            {menu.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text
                  accessibilityRole="header"
                  style={[type.headline, { color: colors.foreground }]}
                >
                  {section.title}
                </Text>
                {section.links.map(({ label, href, icon: Icon }) => (
                  <ListRow
                    key={label}
                    title={label}
                    leading={<Icon size={18} color={colors.primary} />}
                    chevron
                    onPress={() => {
                      hide();
                      router.push(href);
                    }}
                  />
                ))}
              </View>
            ))}
          </ScrollView>
        </ModalOverlay>
      ) : null}
    </DrawerContext.Provider>
  );
}

export function PortalDrawerButton({ onPress }: { onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open navigation menu"
      onPress={onPress}
      android_ripple={{ color: colors.muted }}
      style={styles.trigger}
    >
      <Menu size={24} color={colors.primary} accessible={false} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  drawer: { width: "85%", maxWidth: 352 },
  section: { marginTop: spacing.xxl, gap: spacing.xs },
  trigger: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
});
