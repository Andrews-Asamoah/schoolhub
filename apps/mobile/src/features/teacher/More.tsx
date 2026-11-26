import {
  CalendarDays,
  ClipboardList,
  Files,
  Megaphone,
  UsersRound,
} from "lucide-react-native";
import { PortalMenu, SchoolAccountMenu } from "@/components/PortalMenu";
import { useNotificationsQuery } from "@/features/shared/queries";
import { TeacherPage } from "./ui";

export default function TeacherMore() {
  const notifications = useNotificationsQuery();
  return (
    <TeacherPage title="More">
      <PortalMenu
        title="Teaching tools"
        hue="violet"
        links={[
          {
            label: "Weekly timetable",
            href: "/(teacher)/teacher-timetable",
            icon: CalendarDays,
          },
          {
            label: "Report recommendations",
            href: "/(teacher)/teacher-report-review",
            icon: ClipboardList,
          },
          {
            label: "Clubs",
            href: "/(teacher)/teacher-clubs",
            icon: UsersRound,
          },
        ]}
      />
      <PortalMenu
        title="School resources"
        hue="amber"
        links={[
          {
            label: "Announcements",
            href: "/(shared)/announcements",
            icon: Megaphone,
          },
          {
            label: "Staff documents",
            href: "/(teacher)/teacher-documents",
            icon: Files,
          },
        ]}
      />
      <SchoolAccountMenu
        messagesHref="/(teacher)/teacher-messages"
        unread={notifications.data?.unreadCount}
      />
    </TeacherPage>
  );
}
