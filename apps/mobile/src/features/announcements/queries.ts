import { useQuery } from "@tanstack/react-query";
import { listAnnouncements } from "@/api/announcements";
import { isMobileRole, type MobileRole } from "@/lib/permissions";
import { useSession } from "@/lib/session";
export const announcementKeys = {
  list: (school: string | null, role: MobileRole | null) =>
    ["school", school, role, "announcements"] as const,
};
export function useAnnouncementsQuery() {
  const session = useSession();
  return useQuery({
    queryKey: announcementKeys.list(session.subdomain, session.activeRole),
    queryFn: ({ signal }) => listAnnouncements({ signal }),
    enabled: session.status === "ready" && isMobileRole(session.activeRole),
    meta: { persist: false },
  });
}
