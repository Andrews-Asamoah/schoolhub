import { useQuery } from "@tanstack/react-query";
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
function teacherName(teacher?: TeacherSummary | null) {
  const first = teacher?.profile?.firstName ?? teacher?.firstName ?? "";
  const last = teacher?.profile?.lastName ?? teacher?.lastName ?? "";
  return [first, last].filter(Boolean).join(" ").trim();
}

function RetryMessage({ message, onRetry, isFetching }: {
  message: string; onRetry: () => void; isFetching: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-6 text-center">
      <p className="text-sm text-destructive">{message}</p>
      <button type="button" onClick={onRetry} disabled={isFetching}
        className="mt-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground/80 disabled:opacity-50">
        <RefreshCw className={cn("size-3.5", isFetching && "animate-spin")} />
        {isFetching ? "Retrying…" : "Try again"}
      </button>
    </div>
  );
}

export function StudentHouseClubsView({ view }: { view: "HOUSE" | "CLUBS" }) {

  const profileQuery = useQuery({
    queryKey: ["students", "me"],
    queryFn: () => apiFetch<StudentProfile>("/students/me"),
    enabled: view === "HOUSE",
    retry: false,
  });
  const housesQuery = useQuery({
    queryKey: ["academics", "houses"],
    queryFn: () => apiFetch<House[]>("/academics/houses"),
    enabled: view === "HOUSE",
    retry: false,
  });
  const myClubsQuery = useQuery({
    queryKey: ["students", "me", "clubs"],
    queryFn: () => apiFetch<ClubMembership[]>("/students/me/clubs"),
    enabled: view === "CLUBS",
    retry: false,
  });
  const allClubsQuery = useQuery({
    queryKey: ["academics", "clubs"],
    queryFn: () => apiFetch<Club[]>("/academics/clubs"),
    enabled: view === "CLUBS",
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
      <div>
        <h2 className="text-xl font-black text-foreground">
          {view === "HOUSE" ? "My House" : "Clubs & Societies"}
        </h2>
        <p className="text-xs text-muted-foreground">
          {view === "HOUSE"
            ? "View your assigned house and the active houses in your school."
            : "View your club memberships and other clubs available at your school."}
        </p>
      </div>

      {view === "CLUBS" ? (
        <div className="space-y-7">
          <section>
            <div className="flex items-center justify-between gap-3 pb-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Sparkles className="size-4 text-primary" /> Clubs You Have Joined
              </h3>
              {!myClubsQuery.isLoading && !myClubsQuery.isError &&
                <span className="text-xs text-muted-foreground/70">{myClubsQuery.data?.length ?? 0} memberships</span>}
            </div>
            {myClubsQuery.isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading your club memberships…</p>
            ) : myClubsQuery.isError ? (
              <RetryMessage message="Your club memberships could not be loaded."
                onRetry={() => void myClubsQuery.refetch()} isFetching={myClubsQuery.isFetching} />
            ) : (myClubsQuery.data?.length ?? 0) === 0 ? (
              <div className="rounded-xl border border-dashed border-input px-4 py-8 text-center">
                <p className="text-sm font-semibold text-foreground/80">You have not joined any clubs yet.</p>
                <p className="mt-1 text-xs text-muted-foreground">Available school clubs are listed below.</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {myClubsQuery.data?.map(({ membershipId, role, club }) => {
                  const patron = teacherName(club.teacherInCharge);
                  return (
                    <article key={membershipId}
                      className="flex flex-col justify-between rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/10 via-card to-card p-5 shadow-xs dark:bg-card">
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <h4 className="text-sm font-bold text-foreground">{club.name}</h4>
                          <span className="shrink-0 rounded-md bg-primary px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary-foreground">{role || "Member"}</span>
                        </div>
                        {club.description && <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{club.description}</p>}
                      </div>
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                        {patron && <span>Patron: {patron}</span>}
                        {typeof club._count?.members === "number" && <span className="font-semibold text-foreground/80">{club._count.members} members</span>}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h3 className="flex items-center gap-2 pb-3 text-sm font-bold text-foreground">
              <Users className="size-4 text-muted-foreground" /> Other School Clubs
            </h3>
            {allClubsQuery.isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading school clubs…</p>
            ) : allClubsQuery.isError ? (
              <RetryMessage message="School clubs could not be loaded."
                onRetry={() => void allClubsQuery.refetch()} isFetching={allClubsQuery.isFetching} />
            ) : myClubsQuery.isLoading || myClubsQuery.isError ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Other-club availability cannot be determined until your memberships load.</p>
            ) : otherClubs.length === 0 ? (
              <p className="rounded-xl border border-dashed border-input px-4 py-8 text-center text-sm text-muted-foreground">There are no other clubs listed by your school.</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {otherClubs.map((club) => {
                  const patron = teacherName(club.teacherInCharge);
                  return (
                    <article key={club.id}
                      className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-4 text-xs shadow-xs">
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-bold text-foreground">{club.name}</h4>
                          <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-semibold",
                            club.isActive ? "bg-muted text-muted-foreground" : "bg-warning/10 text-warning")}>
                            {club.isActive ? "Available" : "Inactive"}
                          </span>
                        </div>
                        {club.description && <p className="mt-1.5 line-clamp-3 leading-relaxed text-muted-foreground">{club.description}</p>}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                        {patron && <span>Patron: {patron}</span>}
                        {typeof club._count?.members === "number" && <span className="font-bold text-foreground/80">{club._count.members} students</span>}
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
            <span className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><Home className="size-5" /></span>
            <div>
              <h3 className="text-sm font-bold text-foreground">House Directory</h3>
              <p className="text-xs text-muted-foreground">Your assigned house and the active houses in your school</p>
            </div>
          </div>
          {profileQuery.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading your student profile…</p>
          ) : profileQuery.isError ? (
            <RetryMessage message="Your house assignment could not be loaded."
              onRetry={() => void profileQuery.refetch()} isFetching={profileQuery.isFetching} />
          ) : !profileQuery.data?.house ? (
            <div className="rounded-xl border border-dashed border-input px-4 py-6 text-sm text-muted-foreground">No house has been assigned to your student profile.</div>
          ) : (
            <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Your Assigned House</p>
              <h4 className="mt-1 text-lg font-black text-foreground">
                {myHouse?.name ?? profileQuery.data.house.name}
              </h4>
              {myHouse?.motto && <p className="mt-1 text-xs italic text-muted-foreground">{myHouse.motto}</p>}
            </div>
          )}
          {housesQuery.isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Loading school houses…</p>
          ) : housesQuery.isError ? (
            <RetryMessage message="The school house directory could not be loaded."
              onRetry={() => void housesQuery.refetch()} isFetching={housesQuery.isFetching} />
          ) : activeHouses.length === 0 ? (
            <p className="rounded-xl border border-dashed border-input px-4 py-8 text-center text-sm text-muted-foreground">No houses have been configured for this school.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {activeHouses.map((house) => {
                const mine = house.id === myHouseId;
                const patron = teacherName(house.houseTeacher);
                return (
                  <article key={house.id} className={cn("rounded-2xl border bg-card p-4 shadow-xs",
                    mine ? "border-primary/20" : "border-border/80")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span aria-label="House colour" className="size-3 shrink-0 rounded-full" style={{ backgroundColor: house.color || "#64748b" }} />
                        <h4 className="text-sm font-bold text-foreground">{house.name}</h4>
                      </div>
                      {mine && <span className="rounded-md bg-primary px-2 py-0.5 text-[9px] font-bold uppercase text-primary-foreground">Your house</span>}
                    </div>
                    {house.description && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{house.description}</p>}
                    {house.motto && <p className="mt-2 text-xs italic text-muted-foreground">{house.motto}</p>}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
                      {patron && <span>House teacher: {patron}</span>}
                      {typeof house._count?.students === "number" && <span className="font-semibold text-foreground/80">{house._count.students} students</span>}
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
