import { useQuery } from "@tanstack/react-query";
import {
  getMyWard,
  getWardAttendance,
  getWardFees,
  getWardTimetable,
  listGuardianClubs,
  listGuardianHouses,
  listGuardianReports,
  listMyWards,
} from "@/api/guardian";
import { useSession } from "@/lib/session";

function useGuardianScope() {
  const session = useSession();
  return {
    school: session.subdomain,
    enabled: session.status === "ready" && session.activeRole === "guardian",
  };
}
export const guardianKeys = {
  root: (school: string | null) => ["school", school, "guardian"] as const,
  wards: (school: string | null) =>
    [...guardianKeys.root(school), "wards"] as const,
  ward: (school: string | null, id: string) =>
    [...guardianKeys.root(school), "ward", id] as const,
  attendance: (school: string | null, id: string) =>
    [...guardianKeys.root(school), "attendance", id] as const,
  fees: (school: string | null, id: string) =>
    [...guardianKeys.root(school), "fees", id, "all"] as const,
  timetable: (school: string | null, id: string) =>
    [...guardianKeys.root(school), "timetable", id] as const,
  reports: (school: string | null) =>
    [...guardianKeys.root(school), "reports"] as const,
  clubs: (school: string | null) =>
    [...guardianKeys.root(school), "clubs"] as const,
  houses: (school: string | null) =>
    [...guardianKeys.root(school), "houses"] as const,
};

export function useMyWardsQuery() {
  const scope = useGuardianScope();
  return useQuery({
    queryKey: guardianKeys.wards(scope.school),
    queryFn: ({ signal }) => listMyWards({ signal }),
    enabled: scope.enabled,
    meta: { persist: false },
  });
}
export function useMyWardQuery(id: string) {
  const scope = useGuardianScope();
  return useQuery({
    queryKey: guardianKeys.ward(scope.school, id),
    queryFn: ({ signal }) => getMyWard(id, { signal }),
    enabled: scope.enabled && !!id,
    meta: { persist: false },
  });
}
export function useWardAttendanceQuery(id: string) {
  const scope = useGuardianScope();
  return useQuery({
    queryKey: guardianKeys.attendance(scope.school, id),
    queryFn: ({ signal }) => getWardAttendance(id, { signal }),
    enabled: scope.enabled && !!id,
    meta: { persist: false },
  });
}
export function useWardFeesQuery(id: string) {
  const scope = useGuardianScope();
  return useQuery({
    queryKey: guardianKeys.fees(scope.school, id),
    queryFn: ({ signal }) => getWardFees(id, { signal }),
    enabled: scope.enabled && !!id,
    meta: { persist: false },
  });
}
export function useWardTimetableQuery(id: string) {
  const scope = useGuardianScope();
  return useQuery({
    queryKey: guardianKeys.timetable(scope.school, id),
    queryFn: ({ signal }) => getWardTimetable(id, { signal }),
    enabled: scope.enabled && !!id,
    meta: { persist: false },
  });
}
export function useGuardianReportsQuery() {
  const scope = useGuardianScope();
  return useQuery({
    queryKey: guardianKeys.reports(scope.school),
    queryFn: ({ signal }) => listGuardianReports({ signal }),
    enabled: scope.enabled,
    meta: { persist: false },
  });
}
export function useGuardianClubsQuery() {
  const scope = useGuardianScope();
  return useQuery({
    queryKey: guardianKeys.clubs(scope.school),
    queryFn: ({ signal }) => listGuardianClubs({ signal }),
    enabled: scope.enabled,
    meta: { persist: false },
  });
}
export function useGuardianHousesQuery() {
  const scope = useGuardianScope();
  return useQuery({
    queryKey: guardianKeys.houses(scope.school),
    queryFn: ({ signal }) => listGuardianHouses({ signal }),
    enabled: scope.enabled,
    meta: { persist: false },
  });
}
