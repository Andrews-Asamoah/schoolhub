import { Redirect, type Href } from "expo-router";
import { useSession } from "@/lib/session";

const messagesByRole = {
  teacher: "/(teacher)/teacher-messages",
  student: "/(student)/student-messages",
  guardian: "/(guardian)/guardian-messages",
} satisfies Record<string, Href>;

export default function LegacyMessagesRoute() {
  const { activeRole } = useSession();
  return <Redirect href={activeRole ? messagesByRole[activeRole] : "/"} />;
}
