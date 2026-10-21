import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface TeachingClass {
  id: string;
  name: string;
  level: string;
  /** Class teacher: may manage the class and mark its register. */
  isClassTeacher: boolean;
  studentCount: number;
  subjects: { id: string; name: string; code: string }[];
}

export interface TeachingOverview {
  teacher: { id: string; name: string } | null;
  term: { id: string; name: string } | null;
  classes: TeachingClass[];
}

/** The signed-in teacher's own classes: where they are class teacher and what they teach. */
export function useTeachingOverview(enabled = true) {
  return useQuery({
    queryKey: ["teaching", "me"],
    queryFn: () => apiFetch<TeachingOverview>("/teaching/me"),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
}
