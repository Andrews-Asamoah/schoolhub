import { useQuery } from "@tanstack/react-query";
import {
  Award,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Flame,
  Home,
  Shield,
  Sparkles,
  Trophy,
  User,
  Users,
} from "lucide-react";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface StudentClubMembership {
  membershipId: string;
  role: string;
  joinedAt: string;
  club: {
    id: string;
    name: string;
    description?: string | null;
    teacherInCharge?: {
      firstName?: string | null;
      lastName?: string | null;
      profile?: { firstName: string; lastName: string } | null;
    } | null;
    _count?: { members: number };
  };
}

const mockJoinedClubs = [
  {
    id: "cl-1",
    name: "Science & Robotics Club",
    role: "President",
    description: "Hands-on STEM experiments, Arduino programming, and national competition prep.",
    meetingTime: "Every Wednesday • 3:30 PM - 5:00 PM",
    patron: "Mrs. Grace Appiah",
    membersCount: 28,
  },
  {
    id: "cl-2",
    name: "Literary & Debate Society",
    role: "Lead Speaker",
    description: "Public speaking, parliamentary debating, critical analysis, and rhetoric workshops.",
    meetingTime: "Every Friday • 3:30 PM - 4:45 PM",
    patron: "Ms. Veronica Kusi",
    membersCount: 34,
  },
  {
    id: "cl-3",
    name: "Red Cross & First Aid Youth",
    role: "Member",
    description: "Emergency health response training, humanitarian volunteering, and community hygiene.",
    meetingTime: "Every 2nd Tuesday • 4:00 PM",
    patron: "Mr. Francis Boakye",
    membersCount: 22,
  },
];

const mockAllSchoolClubs = [
  { id: "cl-1", name: "Science & Robotics Club", description: "Hands-on STEM experiments and robotics building.", patron: "Mrs. Grace Appiah", membersCount: 28, isJoined: true },
  { id: "cl-2", name: "Literary & Debate Society", description: "Public speaking, parliamentary debating, and essays.", patron: "Ms. Veronica Kusi", membersCount: 34, isJoined: true },
  { id: "cl-3", name: "Red Cross & First Aid Youth", description: "Emergency response and humanitarian training.", patron: "Mr. Francis Boakye", membersCount: 22, isJoined: true },
  { id: "cl-4", name: "ICT & Coding Society", description: "Web development, python fundamentals, and game design.", patron: "Mr. Ebenezer Osei", membersCount: 41, isJoined: false },
  { id: "cl-5", name: "School Choir & Brass Band", description: "Musical harmony, orchestral brass, and state festival anthems.", patron: "Mr. Samuel Acheampong", membersCount: 38, isJoined: false },
  { id: "cl-6", name: "Cadet Corps & Drill", description: "Discipline, leadership development, parades, and fitness.", patron: "Sgt. Major D. K. Mensah", membersCount: 50, isJoined: false },
];

export function StudentHouseClubsView() {
  const [activeTab, setActiveTab] = useState<"HOUSE" | "CLUBS">("CLUBS");

  const { data: myClubsData } = useQuery({
    queryKey: ["students", "me", "clubs"],
    queryFn: () => apiFetch<StudentClubMembership[]>("/students/me/clubs"),
    retry: false,
  });

  const { data: allClubsData } = useQuery({
    queryKey: ["academics", "clubs"],
    queryFn: () => apiFetch<any[]>("/academics/clubs"),
    retry: false,
  });

  const joinedClubs =
    myClubsData && myClubsData.length > 0
      ? myClubsData.map((m) => ({
          id: m.club.id,
          name: m.club.name,
          role: m.role || "Member",
          description: m.club.description || "Student co-curricular activity and club meetings.",
          meetingTime: "Weekly scheduled sessions",
          patron: m.club.teacherInCharge?.profile
            ? `${m.club.teacherInCharge.profile.firstName} ${m.club.teacherInCharge.profile.lastName}`
            : "Assigned Teacher Patron",
          membersCount: m.club._count?.members || 1,
        }))
      : mockJoinedClubs;

  const allClubs =
    allClubsData && allClubsData.length > 0
      ? allClubsData.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description || "Student school club.",
          patron: c.teacherInCharge?.profile
            ? `${c.teacherInCharge.profile.firstName} ${c.teacherInCharge.profile.lastName}`
            : "Teacher Patron",
          membersCount: c._count?.members || 0,
          isJoined: joinedClubs.some((j) => j.id === c.id),
        }))
      : mockAllSchoolClubs;

  return (
    <div className="space-y-6">
      {/* Switcher Tab */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">House & Clubs</h2>
          <p className="text-xs text-slate-500">
            Co-curricular activities, student organizations, and house competitions
          </p>
        </div>

        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 text-xs dark:border-slate-800 dark:bg-slate-900">
          <button
            onClick={() => setActiveTab("CLUBS")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 font-bold transition",
              activeTab === "CLUBS"
                ? "bg-indigo-600 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-300",
            )}
          >
            <Sparkles className="size-3.5" />
            Clubs Joined ({joinedClubs.length})
          </button>
          <button
            onClick={() => setActiveTab("HOUSE")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 font-bold transition",
              activeTab === "HOUSE"
                ? "bg-amber-500 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-300",
            )}
          >
            <Trophy className="size-3.5" />
            My House Standings
          </button>
        </div>
      </div>

      {/* CLUBS TAB */}
      {activeTab === "CLUBS" && (
        <div className="space-y-6">
          {/* Section: Clubs Joined */}
          <div>
            <div className="flex items-center justify-between pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Sparkles className="size-4 text-indigo-600" />
                Clubs You Have Joined
              </h3>
              <span className="text-xs text-slate-400">
                Active in {joinedClubs.length} extracurricular organizations
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {joinedClubs.map((club) => (
                <div
                  key={club.id}
                  className="flex flex-col justify-between rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50/40 via-white to-white p-5 shadow-xs dark:border-indigo-900/40 dark:bg-slate-900"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                        {club.name}
                      </h4>
                      <span className="rounded-md bg-indigo-600 px-2 py-0.5 text-[9px] font-black text-white uppercase tracking-wider">
                        {club.role}
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed">
                      {club.description}
                    </p>
                  </div>

                  <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                      <Clock className="size-3 text-indigo-600" />
                      <span>{club.meetingTime}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Patron: {club.patron}</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {club.membersCount} Members
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Section: Explore All School Clubs */}
          <div className="pt-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 pb-3">
              <Users className="size-4 text-slate-600" />
              All School Clubs & Societies
            </h3>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {allClubs.map((club) => (
                <div
                  key={club.id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-4 text-xs shadow-xs dark:border-slate-800 dark:bg-slate-900"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-slate-900 dark:text-white">
                        {club.name}
                      </h4>
                      {club.isJoined ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                          <Check className="size-3" /> Enrolled
                        </span>
                      ) : (
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                          Available
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-slate-500 leading-relaxed line-clamp-2">
                      {club.description}
                    </p>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-400 dark:border-slate-800">
                    <span>Patron: {club.patron}</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      {club.membersCount} students
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* HOUSE TAB */}
      {activeTab === "HOUSE" && (
        <div className="space-y-6">
          {/* Main House Banner */}
          <div className="rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-amber-100/50 to-white p-6 shadow-xs dark:border-amber-900/40 dark:bg-slate-900">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex size-16 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-500/30">
                  <Trophy className="size-8" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-amber-500 px-2 py-0.5 text-[10px] font-black uppercase text-white">
                      Your House
                    </span>
                    <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                      Ranked #1 in School
                    </span>
                  </div>
                  <h3 className="mt-1 text-2xl font-black text-amber-950 dark:text-amber-200">
                    Aggrey House (Yellow)
                  </h3>
                  <p className="text-xs font-semibold italic text-amber-800 dark:text-amber-300">
                    &ldquo;Always on Top • Strive for Excellence&rdquo;
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 border-t border-amber-200 pt-4 md:border-t-0 md:pt-0">
                <div className="rounded-2xl bg-white/90 p-4 text-center shadow-xs dark:bg-slate-800">
                  <p className="text-2xl font-black text-amber-600">450</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Championship Pts
                  </p>
                </div>
                <div className="rounded-2xl bg-white/90 p-4 text-center shadow-xs dark:bg-slate-800">
                  <p className="text-2xl font-black text-slate-900 dark:text-white">124</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    House Members
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Leaderboard Table */}
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white pb-3 border-b border-slate-100 dark:border-slate-800">
              Inter-House Championship Leaderboard (Term 1)
            </h3>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
              {[
                { rank: 1, name: "Aggrey House (Yellow)", points: 450, color: "bg-amber-500", isUserHouse: true, motto: "Always on Top" },
                { rank: 2, name: "Gbewaa House (Blue)", points: 420, color: "bg-blue-500", motto: "Forward with Courage" },
                { rank: 3, name: "Osei Tutu House (Green)", points: 395, color: "bg-emerald-500", motto: "Wisdom and Honor" },
                { rank: 4, name: "Yaa Asantewaa House (Red)", points: 380, color: "bg-rose-500", motto: "Valour and Unity" },
              ].map((h) => (
                <div
                  key={h.rank}
                  className={`flex items-center justify-between py-3.5 px-3 rounded-xl transition ${
                    h.isUserHouse ? "bg-amber-50/60 dark:bg-amber-950/20" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex size-7 items-center justify-center rounded-full text-xs font-black ${
                        h.rank === 1
                          ? "bg-amber-500 text-white"
                          : h.rank === 2
                            ? "bg-slate-300 text-slate-800"
                            : h.rank === 3
                              ? "bg-amber-700 text-white"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800"
                      }`}
                    >
                      {h.rank}
                    </span>

                    <span className={`size-3 rounded-full ${h.color}`} />

                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        {h.name}
                        {h.isUserHouse && (
                          <span className="rounded-md bg-amber-500 px-1.5 py-0.2 text-[9px] font-black text-white">
                            YOUR HOUSE
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-slate-400 italic">{h.motto}</p>
                    </div>
                  </div>

                  <span className="text-sm font-black text-slate-900 dark:text-white">
                    {h.points} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
