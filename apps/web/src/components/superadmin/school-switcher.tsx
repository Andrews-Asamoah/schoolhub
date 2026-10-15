import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Building2 } from "lucide-react";
import { apiFetch } from "@/lib/api";

interface SchoolOption {
  id: string;
  name: string;
  code: string;
}

export function SchoolSwitcher() {
  const navigate = useNavigate();
  const schools = useQuery({
    queryKey: ["superadmin", "school-options"],
    queryFn: () => apiFetch<SchoolOption[]>("/super-admin/schools/options"),
    retry: false,
  });

  if (schools.isPending || !schools.data?.length) {
    if (schools.error) {
      return (
        <span role="alert" className="text-xs text-rose-700 dark:text-rose-300" title={schools.error.message}>
          Schools unavailable
        </span>
      );
    }
    return null;
  }

  return (
    <label className="flex min-w-0 max-w-36 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 sm:max-w-52">
      <Building2 className="size-4 shrink-0 text-indigo-600 dark:text-indigo-300" />
      <span className="sr-only">Switch school</span>
      <select
        aria-label="Switch school"
        defaultValue=""
        onChange={(event) => {
          const schoolId = event.target.value;
          if (schoolId) {
            void navigate({
              to: "/admin/schools/$schoolId",
              params: { schoolId },
            });
          }
        }}
        className="max-w-20 cursor-pointer bg-transparent outline-none sm:max-w-40"
      >
        <option value="">Switch school…</option>
        {schools.data.map((school) => (
          <option key={school.id} value={school.id}>
            {school.name} · {school.code}
          </option>
        ))}
      </select>
    </label>
  );
}
