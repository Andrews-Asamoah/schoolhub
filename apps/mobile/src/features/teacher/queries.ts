import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/session";
export const teacherKey = (
  school: string | null,
  ...parts: readonly unknown[]
) => ["school", school, "teacher", "teacher-app", ...parts] as const;
/** Teacher records live only in memory; transport also enforces session generation. */
export function useTeacherQuery<T>(
  parts: readonly unknown[],
  load: (signal: AbortSignal) => Promise<T>,
  enabled = true,
) {
  const session = useSession();
  return useQuery({
    queryKey: teacherKey(session.subdomain, ...parts),
    queryFn: ({ signal }) => load(signal),
    enabled:
      enabled && session.status === "ready" && session.activeRole === "teacher",
    meta: { persist: false },
  });
}
