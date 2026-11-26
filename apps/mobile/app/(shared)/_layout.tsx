import { Redirect, useLocalSearchParams, usePathname } from "expo-router";
import { portalToolHref } from "@/lib/portal-tools";
import { useSession } from "@/lib/session";

export default function SharedLayout() {
  const { activeRole } = useSession();
  const pathname = usePathname();
  const { id } = useLocalSearchParams<{ id?: string }>();
  if (!activeRole) return <Redirect href="/" />;
  if (pathname === "/messages")
    return <Redirect href={`/(${activeRole})/${activeRole}-messages`} />;
  const path =
    pathname.startsWith("/announcements/") && id
      ? `/announcements/${id}`
      : pathname;
  return <Redirect href={portalToolHref(activeRole, path)} />;
}
