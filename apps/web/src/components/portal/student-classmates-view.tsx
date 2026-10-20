import { useQuery } from "@tanstack/react-query";
import { GraduationCap, MapPin, Search, Shield, User, Users } from "lucide-react";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

interface ClassmateItem {
  id: string;
  isSelf?: boolean;
  studentId: string;
  admissionNumber: string;
  name: string;
  firstName?: string;
  lastName?: string;
  house: string;
  houseColor?: string;
  role?: string;
  gender?: string | null;
}

interface ClassmatesResponse {
  class: {
    id: string;
    name: string;
    level: string;
    classTeacher?: {
      id: string;
      firstName: string;
      lastName: string;
      profile?: { firstName: string; lastName: string } | null;
    } | null;
  } | null;
  classmates: ClassmateItem[];
}

const mockClassmates: ClassmateItem[] = [
  { id: "cm-1", isSelf: true, name: "Kwame Asante", studentId: "STU-2024-001", admissionNumber: "ADM-2024-001", role: "Class Prefect", house: "Aggrey House", houseColor: "#F59E0B" },
  { id: "cm-2", name: "Ama Boateng", studentId: "STU-2024-002", admissionNumber: "ADM-2024-002", role: "Assistant Prefect", house: "Aggrey House", houseColor: "#F59E0B" },
  { id: "cm-3", name: "Emanuel Mensah", studentId: "STU-2024-003", admissionNumber: "ADM-2024-003", role: "Sports Captain", house: "Gbewaa House", houseColor: "#3B82F6" },
  { id: "cm-4", name: "Akua Osei", studentId: "STU-2024-004", admissionNumber: "ADM-2024-004", house: "Osei Tutu House", houseColor: "#10B981" },
  { id: "cm-5", name: "Kofi Appiah", studentId: "STU-2024-005", admissionNumber: "ADM-2024-005", house: "Yaa Asantewaa House", houseColor: "#EF4444" },
  { id: "cm-6", name: "Abena Danquah", studentId: "STU-2024-006", admissionNumber: "ADM-2024-006", role: "Library Prefect", house: "Aggrey House", houseColor: "#F59E0B" },
  { id: "cm-7", name: "Yaw Frimpong", studentId: "STU-2024-007", admissionNumber: "ADM-2024-007", house: "Gbewaa House", houseColor: "#3B82F6" },
  { id: "cm-8", name: "Nana Yaa Serwaa", studentId: "STU-2024-008", admissionNumber: "ADM-2024-008", house: "Osei Tutu House", houseColor: "#10B981" },
  { id: "cm-9", name: "Kojo Owusu", studentId: "STU-2024-009", admissionNumber: "ADM-2024-009", house: "Yaa Asantewaa House", houseColor: "#EF4444" },
  { id: "cm-10", name: "Esi Badu", studentId: "STU-2024-010", admissionNumber: "ADM-2024-010", house: "Aggrey House", houseColor: "#F59E0B" },
  { id: "cm-11", name: "Samuel Antwi", studentId: "STU-2024-011", admissionNumber: "ADM-2024-011", house: "Gbewaa House", houseColor: "#3B82F6" },
  { id: "cm-12", name: "Belinda Darko", studentId: "STU-2024-012", admissionNumber: "ADM-2024-012", house: "Osei Tutu House", houseColor: "#10B981" },
];

export function StudentClassmatesView() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["students", "me", "classmates"],
    queryFn: () => apiFetch<ClassmatesResponse>("/students/me/classmates"),
    retry: false,
  });

  const classmatesList = data?.classmates && data.classmates.length > 0 ? data.classmates : mockClassmates;
  const className = data?.class?.name ?? "JHS 3 Emerald";
  const teacherName = data?.class?.classTeacher?.profile
    ? `${data.class.classTeacher.profile.firstName} ${data.class.classTeacher.profile.lastName}`
    : "Mrs. Grace Appiah";

  const filtered = classmatesList.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.house.toLowerCase().includes(search.toLowerCase()) ||
    (c.role && c.role.toLowerCase().includes(search.toLowerCase())) ||
    c.admissionNumber.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Class Header Banner */}
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-r from-indigo-50/70 via-white to-sky-50/50 p-5 shadow-xs dark:border-indigo-900/30 dark:bg-slate-900">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-sm shadow-indigo-600/30">
              <GraduationCap className="size-6" />
            </span>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                {className}
              </h2>
              <p className="text-xs text-slate-500">
                Class Teacher: <span className="font-semibold text-slate-800 dark:text-slate-200">{teacherName}</span> • Block B, Room 102
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
              <Users className="size-4 text-indigo-600" />
              {classmatesList.length} Students Enrolled
            </span>
          </div>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search by name, house, or role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs text-slate-800 outline-none transition focus:border-indigo-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
        />
      </div>

      {/* Classmates Grid */}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {filtered.map((cm) => {
          const initials = cm.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

          return (
            <div
              key={cm.id}
              className={`flex items-center gap-3 rounded-2xl border p-4 shadow-xs transition hover:shadow-sm ${
                cm.isSelf
                  ? "border-indigo-300 bg-indigo-50/50 dark:border-indigo-800 dark:bg-indigo-950/20"
                  : "border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900"
              }`}
            >
              <div
                className={`flex size-11 shrink-0 items-center justify-center rounded-xl font-bold text-xs ${
                  cm.isSelf
                    ? "bg-indigo-600 text-white"
                    : "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                }`}
              >
                {initials}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                    {cm.name}
                  </h4>
                  {cm.isSelf && (
                    <span className="shrink-0 rounded-md bg-indigo-600 px-1.5 py-0.2 text-[9px] font-black text-white">
                      YOU
                    </span>
                  )}
                </div>

                <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {cm.admissionNumber || cm.studentId}
                </p>

                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <span className="inline-block rounded-md bg-slate-100 px-1.5 py-0.2 text-[9px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {cm.house}
                  </span>
                  {cm.role && (
                    <span className="inline-block rounded-md bg-amber-50 px-1.5 py-0.2 text-[9px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                      {cm.role}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
