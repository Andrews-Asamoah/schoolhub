import { Redirect, Stack, useLocalSearchParams } from "expo-router";
import type { ComponentType } from "react";
import AcademicContext from "../../../app/(shared)/academic-context";
import Announcements from "../../../app/(shared)/announcements";
import Announcement from "../../../app/(shared)/announcements/[id]";
import DeliveryHistory from "../../../app/(shared)/delivery-history";
import Compose from "../../../app/(shared)/messages-new";
import Notifications from "../../../app/(shared)/notifications";
import NotificationHistory from "../../../app/(shared)/notification-history";
import NotificationSettings from "../../../app/(shared)/notification-settings";
import Profile from "../../../app/(shared)/profile";
import ProfileEdit from "../../../app/(shared)/profile-edit";
import Security from "../../../app/(shared)/security";
import ChangePassword from "../../../app/(shared)/security/change-password";

const tools: Readonly<Record<string, ComponentType>> = {
  "academic-context": AcademicContext,
  announcements: Announcements,
  announcement: Announcement,
  "delivery-history": DeliveryHistory,
  "messages-new": Compose,
  notifications: Notifications,
  "notification-history": NotificationHistory,
  "notification-settings": NotificationSettings,
  profile: Profile,
  "profile-edit": ProfileEdit,
  security: Security,
  "change-password": ChangePassword,
};

export function PortalToolsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen
        name="[tool]"
        getId={({ params }) => `${params?.tool}:${params?.id ?? ""}`}
      />
    </Stack>
  );
}

export function PortalTool() {
  const { tool = "", id } = useLocalSearchParams<{
    tool: string;
    id?: string;
  }>();
  const Component = Object.hasOwn(tools, tool) ? tools[tool] : undefined;
  return Component ? (
    <Component key={`${tool}:${id ?? ""}`} />
  ) : (
    <Redirect href="/" />
  );
}
