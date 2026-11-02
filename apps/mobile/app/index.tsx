import { Redirect, type Href } from "expo-router";
import { useSession } from "@/lib/session";
import { roleGroup } from "@/lib/permissions";
export default function Index() {
  const session = useSession();
  return (
    <Redirect
      href={
        session.status === "ready" && session.activeRole
          ? (`/${roleGroup(session.activeRole)}` as Href)
          : "/login"
      }
    />
  );
}
