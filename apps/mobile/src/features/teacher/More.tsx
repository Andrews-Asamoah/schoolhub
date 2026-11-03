import type { Href } from "expo-router";
import { TeacherPage, Panel, LinkButton } from "./ui";
import { useNotificationsQuery } from "@/features/shared/queries";
export default function TeacherMore() {
  const notifications = useNotificationsQuery();
  return (
    <TeacherPage title="More">
      <Panel title="Teaching tools">
        <LinkButton
          label="Weekly timetable"
          href={"/(teacher)/teacher-timetable" as Href}
        />
        <LinkButton label="Clubs" href={"/(teacher)/teacher-clubs" as Href} />
        <LinkButton
          label="Report recommendations"
          href={"/(teacher)/teacher-report-review" as Href}
        />
      </Panel>
      <Panel title="School and account">
        <LinkButton
          label="Announcements"
          href={"/(shared)/announcements" as Href}
        />
        <LinkButton
          label={`Notifications${notifications.data?.unreadCount ? ` (${notifications.data.unreadCount} unread)` : ""}`}
          href={"/(shared)/notifications" as Href}
        />
        <LinkButton label="Messages" href={"/(shared)/messages" as Href} />
        <LinkButton
          label="Profile and settings"
          href={"/(shared)/profile" as Href}
        />
        <LinkButton
          label="Academic context"
          href={"/(shared)/academic-context" as Href}
        />
        <LinkButton label="Security" href={"/(shared)/security" as Href} />
      </Panel>
    </TeacherPage>
  );
}
