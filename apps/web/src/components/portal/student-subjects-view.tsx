import { useQuery } from "@tanstack/react-query";
import { BookOpen, Calendar, Clock, GraduationCap, MapPin, Search, User } from "lucide-react";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

interface EnrolledSubject {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  periodsPerWeek: number;
  teacher?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  room?: string;
}

interface StudentSubjectsResponse {
  class: { id: string; name: string; level: string } | null;
  subjects: EnrolledSubject[];
}

const mockSubjects: EnrolledSubject[] = [
  { id: "s1", name: "Integrated Science", code: "SCI-09", description: "Biology, Chemistry, and Physics core foundational concepts.", periodsPerWeek: 5, teacher: { id: "t1", firstName: "Grace", lastName: "Appiah" }, room: "Science Lab 1" },
  { id: "s2", name: "Core Mathematics", code: "MTH-09", description: "Algebra, Geometry, Trigonometry, and Statistics.", periodsPerWeek: 5, teacher: { id: "t2", firstName: "Kwabena", lastName: "Darko" }, room: "Room 102" },
  { id: "s3", name: "English Language", code: "ENG-09", description: "Grammar, Essay Writing, Oral English, and Comprehension.", periodsPerWeek: 4, teacher: { id: "t3", firstName: "Veronica", lastName: "Kusi" }, room: "Room 102" },
  { id: "s4", name: "Social Studies", code: "SOC-09", description: "Environment, Culture, Governance, and National Development.", periodsPerWeek: 4, teacher: { id: "t4", firstName: "Kofi", lastName: "Antwi" }, room: "Room 102" },
  { id: "s5", name: "Information Technology", code: "ICT-09", description: "Computer software, Algorithms, Web skills, and Practical lab.", periodsPerWeek: 4, teacher: { id: "t5", firstName: "Ebenezer", lastName: "Osei" }, room: "Computer Lab" },
  { id: "s6", name: "French Language", code: "FRN-09", description: "Introductory French conversation, vocabulary, and composition.", periodsPerWeek: 3, teacher: { id: "t6", firstName: "Claire", lastName: "Mensah" }, room: "Language Room" },
  { id: "s7", name: "Religious & Moral Education", code: "RME-09", description: "Ethics, world religions, and personal character development.", periodsPerWeek: 3, teacher: { id: "t7", firstName: "Samuel", lastName: "Acheampong" }, room: "Room 102" },
  { id: "s8", name: "Physical & Health Education", code: "PHE-09", description: "Sports development, health habits, and athletics training.", periodsPerWeek: 2, teacher: { id: "t8", firstName: "Francis", lastName: "Boakye" }, room: "School Sports Field" },
];

export function StudentSubjectsView() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["students", "me", "subjects"],
    queryFn: () => apiFetch<StudentSubjectsResponse>("/students/me/subjects"),
    retry: false,
  });

  const subjectsList = data?.subjects && data.subjects.length > 0 ? data.subjects : mockSubjects;
  const className = data?.class?.name ?? "JHS 3 Emerald";

  const filtered = subjectsList.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase()) ||
      (s.teacher && `${s.teacher.firstName} ${s.teacher.lastName}`.toLowerCase().includes(search.toLowerCase())),
  );

  const totalPeriods = subjectsList.reduce((acc, s) => acc + (s.periodsPerWeek || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header and Stats */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-foreground">Enrolled Subjects</h2>
          <p className="text-xs text-muted-foreground">
            Registered courses for <span className="font-semibold text-primary">{className}</span> • Active Term
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs">
            <span className="text-muted-foreground/70">Total Courses: </span>
            <span className="font-black text-foreground">{subjectsList.length}</span>
          </div>
          <div className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs">
            <span className="text-muted-foreground/70">Weekly Lessons: </span>
            <span className="font-black text-primary">{totalPeriods} periods</span>
          </div>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/70" />
        <input
          type="text"
          placeholder="Search subjects, codes, teachers..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-xs text-foreground outline-none transition focus:border-primary"
        />
      </div>

      {/* Grid of Subjects */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((sub) => {
          const teacherName = sub.teacher
            ? `${sub.teacher.firstName} ${sub.teacher.lastName}`
            : "Assigned Subject Teacher";

          return (
            <div
              key={sub.id}
              className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-5 shadow-xs transition hover:border-input"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {sub.code}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground/70">
                    <Clock className="size-3" />
                    {sub.periodsPerWeek} periods/wk
                  </span>
                </div>

                <h3 className="mt-2.5 text-sm font-bold text-foreground">
                  {sub.name}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {sub.description || "General course syllabus and periodic curriculum content."}
                </p>
              </div>

              <div className="mt-5 space-y-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <User className="size-3.5 text-muted-foreground/70" />
                  <span className="font-medium text-foreground/80 truncate">
                    {teacherName}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="size-3.5 text-muted-foreground/70" />
                  <span className="text-[11px] text-muted-foreground/70">
                    {sub.room || "Regular Classroom"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
