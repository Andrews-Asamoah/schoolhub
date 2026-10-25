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
        <span role="alert" className="text-xs text-destructive" title={schools.error.message}>
          Schools unavailable
        </span>
      );
    }
    return null;
  }

  return (
    <label className="flex min-w-0 max-w-36 items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-foreground/80 shadow-sm sm:max-w-52">
      <Building2 className="size-4 shrink-0 text-primary" />
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
