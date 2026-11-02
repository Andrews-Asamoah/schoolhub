import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { lookupSchool, schoolCodeSchema } from "@/api/auth";
import { useSession } from "@/lib/session";
import { useTheme } from "@/theme/theme";
export const schoolQuery = (code: string) => ({
  queryKey: ["public-school", code],
  queryFn: ({ signal }: { signal: AbortSignal }) =>
    lookupSchool({ params: { subdomain: code }, signal }),
  meta: { persist: true, privacy: "public" },
  staleTime: 5 * 60 * 1000,
});
export function useSchoolBranding() {
  const { subdomain } = useSession();
  const { setTenant } = useTheme();
  const query = useQuery({
    ...schoolQuery(subdomain ?? ""),
    enabled: schoolCodeSchema.safeParse(subdomain).success,
    retry: false,
  });
  useEffect(() => {
    const school = query.data;
    setTenant(
      school
        ? {
            name: school.name,
            logoUrl: school.logo,
            primaryColor: school.primaryColor,
            secondaryColor: school.secondaryColor,
          }
        : null,
    );
  }, [query.data, setTenant]);
  return query;
}
