import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Home, RefreshCw, Sparkles, Trophy, Users } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface TeacherSummary {
  firstName?: string | null;
  lastName?: string | null;
  profile?: { firstName: string; lastName: string } | null;
}
interface Club {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
  teacherInCharge?: TeacherSummary | null;
  _count?: { members: number };
}
interface ClubMembership {
  membershipId: string;
  role: string;
  joinedAt: string;
  club: Club;
}
interface House {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  color?: string | null;
  motto?: string | null;
  isActive: boolean;
  houseTeacher?: TeacherSummary | null;
  _count?: { students: number };
}
interface StudentProfile {
  house?: { id: string; name: string } | null;
}
type Tab = "HOUSE" | "CLUBS";

function teacherName(teacher?: TeacherSummary | null) {
  const first = teacher?.profile?.firstName ?? teacher?.firstName ?? "";
  const last = teacher?.profile?.lastName ?? teacher?.lastName ?? "";
  return [first, last].filter(Boolean).join(" ").trim();
}

function RetryMessage({ message, onRetry, isFetching }: {
  message: string; onRetry: () => void; isFetching: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm text-rose-600 dark:text-rose-400">{message}</p>
      <button type="button" onClick={onRetry} disabled={isFetching}
        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200">
        <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
        {isFetching ? "Retrying…" : "Try again"}
      </button>
    </div>
  );
}

export function StudentHouseClubsView({ defaultTab = "CLUBS" }: { defaultTab?: Tab }) {
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab);
  useEffect(() => setActiveTab(defaultTab), [defaultTab]);

  const profileQuery = useQuery({
    queryKey: ["students", "me"],
    queryFn: () => apiFetch<StudentProfile>("/students/me"),
    retry: false,
  });
  const housesQuery = useQuery({
    queryKey: ["academics", "houses"],
    queryFn: () => apiFetch<House[]>("/academics/houses"),
    retry: false,
  });
  const myClubsQuery = useQuery({
    queryKey: ["students", "me", "clubs"],
    queryFn: () => apiFetch<ClubMembership[]>("/students/me/clubs"),
    retry: false,
  });
  const allClubsQuery = useQuery({
    queryKey: ["academics", "clubs"],
    queryFn: () => apiFetch<Club[]>("/academics/clubs"),
    retry: false,
  });

  const joinedClubIds = new Set((myClubsQuery.data ?? []).map((membership) => membership.club.id));
  const myHouseId = profileQuery.data?.house?.id;
  const myHouse = (housesQuery.data ?? []).find((house) => house.id === myHouseId);
  const activeHouses = (housesQuery.data ?? [])
    .filter((house) => house.isActive || house.id === myHouseId)
    .sort((a, b) => a.id === myHouseId ? -1 : b.id === myHouseId ? 1 : a.name.localeCompare(b.name));
  const otherClubs = (allClubsQuery.data ?? []).filter((club) => !joinedClubIds.has(club.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">House & Clubs</h2>
          <p className="text-xs text-slate-500">Your house assignment and school clubs, using current school records</p>
        </div>
        <div className="inline-flex w-fit items-center rounded-xl border border-slate-200 bg-white p-1 text-xs dark:border-slate-800 dark:bg-slate-900">
          <button type="button" onClick={() => setActiveTab("CLUBS")}
            className={cn("flex items-center gap-1.5 rounded-lg px-3.5 py-2 font-bold transition",
              activeTab === "CLUBS" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-slate-300")}>
            <Sparkles className="size-3.5" /> Clubs Joined
            {!myClubsQuery.isLoading && !myClubsQuery.isError && <span>({myClubsQuery.data?.length ?? 0})</span>}
          </button>
          <button type="button" onClick={() => setActiveTab("HOUSE")}
            className={cn("flex items-center gap-1.5 rounded-lg px-3.5 py-2 font-bold transition",
              activeTab === "HOUSE" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900 dark:text-slate-300")}>
            <Trophy className="size-3.5" /> My House
          </button>
        </div>
      </div>

      {activeTab === "CLUBS" ? (
        <div className="space-y-7">
          <section>
            <div className="flex items-center justify-between gap-3 pb-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <Sparkles className="size-4 text-indigo-600" /> Clubs You Have Joined
              </h3>
              {!myClubsQuery.isLoading && !myClubsQuery.isError &&
                <span className="text-xs text-slate-400">{myClubsQuery.data?.length ?? 0} memberships</span>}
            </div>
            {myClubsQuery.isLoading ? (
              <p className="py-8 text-center text-sm text-slate-500">Loading your club memberships…</p>
            ) : myClubsQuery.isError ? (
              <RetryMessage message="Your club memberships could not be loaded."
                onRetry={() => void myClubsQuery.refetch()} isFetching={myClubsQuery.isFetching} />
            ) : (myClubsQuery.data?.length ?? 0) === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">You have not joined any clubs yet.</p>
                <p className="mt-1 text-xs text-slate-500">Available school clubs are listed below.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {myClubsQuery.data?.map(({ membershipId, role, club }) => {
                  const patron = teacherName(club.teacherInCharge);
                  return (
                    <article key={membershipId}
                      className="flex flex-col justify-between rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50/40 via-white to-white p-5 shadow-xs dark:border-indigo-900/40 dark:bg-slate-900">
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white">{club.name}</h4>
                          <span className="shrink-0 rounded-md bg-indigo-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">{role || "Member"}</span>
                        </div>
                        {club.description && <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{club.description}</p>}
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800">
                        {patron && <span>Patron: {patron}</span>}
                        {typeof club._count?.members === "number" && <span className="font-semibold text-slate-700 dark:text-slate-300">{club._count.members} members</span>}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h3 className="flex items-center gap-2 pb-3 text-sm font-bold text-slate-900 dark:text-white">
              <Users className="size-4 text-slate-600 dark:text-slate-300" /> Other School Clubs
            </h3>
            {allClubsQuery.isLoading ? (
              <p className="py-8 text-center text-sm text-slate-500">Loading school clubs…</p>
            ) : allClubsQuery.isError ? (
              <RetryMessage message="School clubs could not be loaded."
                onRetry={() => void allClubsQuery.refetch()} isFetching={allClubsQuery.isFetching} />
            ) : myClubsQuery.isLoading || myClubsQuery.isError ? (
              <p className="py-6 text-center text-sm text-slate-500">Other-club availability cannot be determined until your memberships load.</p>
            ) : otherClubs.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">There are no other clubs listed by your school.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {otherClubs.map((club) => {
                  const patron = teacherName(club.teacherInCharge);
                  return (
                    <article key={club.id}
                      className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-4 text-xs shadow-xs dark:border-slate-800 dark:bg-slate-900">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-bold text-slate-900 dark:text-white">{club.name}</h4>
                          <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold",
                            club.isActive ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300")}>
                            {club.isActive ? "Available" : "Inactive"}
                          </span>
                        </div>
                        {club.description && <p className="mt-1.5 line-clamp-3 leading-relaxed text-slate-500">{club.description}</p>}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-slate-800">
                        {patron && <span>Patron: {patron}</span>}
                        {typeof club._count?.members === "number" && <span className="font-bold text-slate-700 dark:text-slate-300">{club._count.members} students</span>}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      ) : (
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-300"><Home className="size-5" /></span>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">House Directory</h3>
              <p className="text-xs text-slate-500">Your assigned house and the active houses in your school</p>
            </div>
          </div>
          {profileQuery.isLoading ? (
            <p className="py-6 text-center text-sm text-slate-500">Loading your student profile…</p>
          ) : profileQuery.isError ? (
            <RetryMessage message="Your house assignment could not be loaded."
              onRetry={() => void profileQuery.refetch()} isFetching={profileQuery.isFetching} />
          ) : !profileQuery.data?.house ? (
            <div className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">No house has been assigned to your student profile.</div>
          ) : (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50/30 p-4 dark:border-indigo-900/40 dark:bg-indigo-950/10">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Your Assigned House</p>
              <h4 className="mt-1 text-lg font-black text-slate-900 dark:text-white">
                {myHouse?.name ?? profileQuery.data.house.name}
              </h4>
              {myHouse?.motto && <p className="mt-1 text-xs italic text-slate-600 dark:text-slate-300">{myHouse.motto}</p>}
            </div>
          )}
          {housesQuery.isLoading ? (
            <p className="py-6 text-center text-sm text-slate-500">Loading school houses…</p>
          ) : housesQuery.isError ? (
            <RetryMessage message="The school house directory could not be loaded."
              onRetry={() => void housesQuery.refetch()} isFetching={housesQuery.isFetching} />
          ) : activeHouses.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-700">No houses have been configured for this school.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {activeHouses.map((house) => {
                const mine = house.id === myHouseId;
                const patron = teacherName(house.houseTeacher);
                return (
                  <article key={house.id} className={cn("rounded-2xl border bg-white p-4 shadow-xs dark:bg-slate-900",
                    mine ? "border-indigo-200 dark:border-indigo-900/60" : "border-slate-200/80 dark:border-slate-800")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span aria-label="House colour" className="size-3 shrink-0 rounded-full" style={{ backgroundColor: house.color || "#64748b" }} />
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">{house.name}</h4>
                      </div>
                      {mine && <span className="rounded-md bg-indigo-600 px-2 py-0.5 text-[9px] font-bold uppercase text-white">Your house</span>}
                    </div>
                    {house.description && <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{house.description}</p>}
                    {house.motto && <p className="mt-2 text-xs italic text-slate-500">{house.motto}</p>}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-slate-800">
                      {patron && <span>House teacher: {patron}</span>}
                      {typeof house._count?.students === "number" && <span className="font-semibold text-slate-700 dark:text-slate-300">{house._count.students} students</span>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
