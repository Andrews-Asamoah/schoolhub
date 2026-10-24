import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  BellRing,
  BookOpenCheck,
  CalendarDays,
  ChevronRight,
  Clock3,
  GraduationCap,
  HeartHandshake,
  Info,
  LoaderCircle,
  Pin,
  ShieldCheck,
  Sparkles,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { GuardianPublishedReports } from "@/components/portal/guardian-published-reports";
import {
  announcementCategoryLabel,
  announcementDate,
  announcementQueryRoleKey,
  announcementTargetLabel,
  type AnnouncementItem,
} from "@/components/portal/announcement-utils";
import type { StudentProfileData } from "@/components/school/student-profile-panel";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type GuardianTab = "overview" | "academics" | "attendance" | "fees" | "timetable" | "notices";

const tabs: { id: GuardianTab; label: string; icon: typeof HeartHandshake }[] = [
  { id: "overview", label: "Overview", icon: HeartHandshake },
  { id: "academics", label: "Academic reports", icon: BookOpenCheck },
  { id: "attendance", label: "Attendance", icon: CalendarDays },
  { id: "fees", label: "Fees", icon: WalletCards },
  { id: "timetable", label: "Timetable", icon: Clock3 },
  { id: "notices", label: "School notices", icon: BellRing },
];


function Initials({ name }: { name: string }) {
  const initials = name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-sm font-bold text-primary ring-1 ring-inset ring-primary/15">{initials || "ST"}</span>;
}

function Metric({ label, value, detail, icon: Icon }: { label: string; value: string; detail: string; icon: typeof HeartHandshake }) {
  return (
    <div className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-4" /></span>
      </div>
      <p className="mt-4 text-2xl font-bold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

function EmptyFeature({ title, description, icon: Icon }: { title: string; description: string; icon: typeof HeartHandshake }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/70 px-6 py-12 text-center sm:px-10">
      <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Icon className="size-5" /></span>
      <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{description}</p>
      <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><ShieldCheck className="size-3.5" /> Only verified school records are shown here.</p>
    </div>
  );
}

export function GuardianPortalWorkspace({ defaultTab = "overview", showSectionNav = true }: { defaultTab?: GuardianTab; showSectionNav?: boolean }) {
  const [activeTab, setActiveTab] = useState<GuardianTab>(defaultTab);
  useEffect(() => { setActiveTab(defaultTab); }, [defaultTab]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<AnnouncementItem | null>(null);
  const { data: session } = useSession();

  const wardsQuery = useQuery({
    queryKey: ["students", "my-wards"],
    queryFn: () => apiFetch<StudentProfileData[]>("/students/my-wards"),
    retry: false,
  });
  const announcementsQuery = useQuery({
    queryKey: ["announcements", announcementQueryRoleKey()],
    queryFn: () => apiFetch<AnnouncementItem[]>("/announcements"),
    enabled: activeTab === "notices" || activeTab === "overview",
    retry: false,
  });

  const wards = wardsQuery.data ?? [];
  const announcements = (announcementsQuery.data ?? [])
    .filter((item) => !item.expiresAt || new Date(item.expiresAt).getTime() >= Date.now())
    .sort((a, b) => Number(b.isPinned) - Number(a.isPinned) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const firstName = session?.user?.name?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Welcome back, ${firstName}` : "Welcome to your family hub";

  return (
    <div className="space-y-6">
      <section className="relative isolate overflow-hidden rounded-[1.75rem] border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-5 shadow-sm sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 -z-10 size-64 rounded-full bg-primary/10 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-1/3 -z-10 size-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.15em] text-primary">
              <Sparkles className="size-3.5" /> SchoolHub · Family centre
            </span>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{greeting}</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              One trusted place to follow your children's school journey, read published reports and stay informed about school updates.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/$page" params={{ page: "guardian-reports" }} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90">
              <BookOpenCheck className="size-4" /> View reports <ArrowUpRight className="size-3.5" />
            </Link>
            <Link to="/$page" params={{ page: "guardian-notices" }} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background/80 px-4 text-sm font-semibold text-foreground transition hover:bg-accent">
              <BellRing className="size-4" /> School notices
            </Link>
          </div>
        </div>
      </section>

      {wardsQuery.isError && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-foreground">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div><p className="font-semibold">We couldn't load your linked children.</p><p className="mt-1 text-muted-foreground">{wardsQuery.error instanceof Error ? wardsQuery.error.message : "Please try again or contact the school office."}</p></div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Metric label="Linked children" value={wardsQuery.isPending ? "—" : String(wards.length)} detail="Children currently linked to this guardian account" icon={UsersRound} />
        <Metric label="Published reports" value="View reports" detail="Official report cards released by the school" icon={GraduationCap} />
        <Metric label="School updates" value={announcementsQuery.isPending || announcementsQuery.isError ? "—" : String(announcements.length)} detail={announcementsQuery.isError ? "School updates could not be loaded" : "Current notices available to your account"} icon={BellRing} />
      </div>

      {showSectionNav && <nav aria-label="Guardian portal sections" className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-1.5 shadow-sm">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setActiveTab(id)} aria-current={activeTab === id ? "page" : undefined}
            className={cn("inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-semibold transition sm:text-sm", activeTab === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
            <Icon className="size-4" /> {label}
            {id === "notices" && announcements.length > 0 && <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", activeTab === id ? "bg-primary-foreground/15 text-primary-foreground" : "bg-muted text-muted-foreground")}>{announcements.length}</span>}
          </button>
        ))}
      </nav>}

      {activeTab === "overview" && (
        <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
          <section className="min-w-0 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Family profile</p><h2 className="mt-1 text-lg font-bold text-foreground">Children linked to your account</h2><p className="mt-1 text-sm text-muted-foreground">Choose a child to review the school-held profile information.</p></div>
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{wards.length} {wards.length === 1 ? "child" : "children"}</span>
            </div>
            {wardsQuery.isPending ? <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading linked records…</div> :
              wardsQuery.isError ? <p className="py-8 text-sm text-muted-foreground">Linked records are temporarily unavailable.</p> :
              wards.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-border p-6 text-center"><UsersRound className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 font-semibold text-foreground">No children linked yet</p><p className="mt-1 text-sm text-muted-foreground">Contact the school office to verify your guardian record and link your child or children.</p></div> :
              <div className="mt-5 space-y-3">{wards.map((ward) => {
                const name = [ward.profile.firstName, ward.profile.otherNames, ward.profile.lastName].filter(Boolean).join(" ");
                return <article key={ward.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-background/60 p-4 transition hover:border-primary/30 sm:flex-row sm:items-center">
                  <Initials name={name} />
                  <div className="min-w-0 flex-1"><h3 className="font-semibold text-foreground">{name}</h3><p className="mt-1 text-xs text-muted-foreground">{ward.class?.name ?? "Class not assigned"}{ward.admissionNumber ? ` · Admission no. ${ward.admissionNumber}` : ""}</p><div className="mt-2 flex flex-wrap gap-2">{ward.house?.name && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">{ward.house.name}</span>}<span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">{ward.subjects.length} subjects</span></div></div>
                  <Link to="/$page" params={{ page: "guardian-reports" }} className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition hover:bg-accent sm:self-center">View reports <ChevronRight className="size-3.5" /></Link>
                </article>;
              })}</div>}
          </section>
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Stay connected</p><h2 className="mt-1 text-lg font-bold text-foreground">Latest school notices</h2></div><Link to="/$page" params={{ page: "guardian-notices" }} className="text-xs font-semibold text-primary hover:underline">See all</Link></div>
            {announcementsQuery.isPending ? <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading notices…</div> :
              announcementsQuery.isError ? <p className="py-8 text-sm text-muted-foreground">School notices could not be loaded right now.</p> :
              announcements.slice(0, 4).length === 0 ? <p className="py-8 text-sm text-muted-foreground">No current notices have been published for your account.</p> :
              <div className="mt-4 divide-y divide-border">{announcements.slice(0, 4).map((item) => <button key={item.id} type="button" onClick={() => setSelectedAnnouncement(item)} className="block w-full py-3 text-left first:pt-0 last:pb-0"><span className="flex items-start gap-2">{item.isPinned && <Pin className="mt-0.5 size-3.5 shrink-0 text-primary" />}<span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">{item.title}</span><span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">{item.content}</span><span className="mt-1.5 block text-[11px] text-muted-foreground">{announcementDate(item.createdAt)}</span></span><ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" /></span></button>)}</div>}
          </section>
        </div>
      )}

      {activeTab === "academics" && <GuardianPublishedReports />}

      {activeTab === "attendance" && <EmptyFeature icon={CalendarDays} title="Attendance records" description="Attendance is not yet connected to the guardian-facing live records in this portal. Once the school publishes attendance data for linked children, daily status, absence history and term attendance summaries will appear here." />}

      {activeTab === "fees" && <EmptyFeature icon={WalletCards} title="Fees and payment history" description="Fee balances and payment history must come from the school's official billing records. This page does not accept or simulate payments. Contact the school accounts office for a current statement until secure payment processing is connected." />}

      {activeTab === "timetable" && <EmptyFeature icon={Clock3} title="Class timetable" description="A child's timetable will appear here when the school has published a timetable linked to their current class. Please confirm class placement with the school office if you believe a timetable should be available." />}

      {activeTab === "notices" && (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-5"><p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">Family communication</p><h2 className="mt-1 text-xl font-bold text-foreground">School notices</h2><p className="mt-1 text-sm text-muted-foreground">Official updates published for your account's school community.</p></div>
          {announcementsQuery.isPending ? <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading notices…</div> :
            announcementsQuery.isError ? <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-foreground">Unable to load school notices. Please refresh the page or try again later.</div> :
            announcements.length === 0 ? <EmptyFeature icon={BellRing} title="No current notices" description="There are no current announcements available to your guardian account. New school updates will appear here when published." /> :
            <div className="grid gap-3 lg:grid-cols-2">{announcements.map((item) => <article key={item.id} className="rounded-2xl border border-border bg-background/60 p-4"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">{announcementCategoryLabel(item.category)}</span>{item.isPinned && <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-1 text-[11px] font-semibold text-warning"><Pin className="size-3" /> Pinned</span>}</div><h3 className="mt-3 text-base font-semibold text-foreground">{item.title}</h3><p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">{item.content}</p><div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-[11px] text-muted-foreground"><span>{announcementDate(item.createdAt)} · {item.author.name}</span><span>{announcementTargetLabel(item.target)}</span></div></article>)}</div>}
        </section>
      )}

      {selectedAnnouncement && <div role="dialog" aria-modal="true" aria-labelledby="guardian-notice-title" className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setSelectedAnnouncement(null)}><div className="w-full max-w-xl rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">{announcementCategoryLabel(selectedAnnouncement.category)}</p><h2 id="guardian-notice-title" className="mt-2 text-xl font-bold text-foreground">{selectedAnnouncement.title}</h2><p className="mt-1 text-xs text-muted-foreground">{announcementDate(selectedAnnouncement.createdAt)} · {selectedAnnouncement.author.name}</p></div><button type="button" onClick={() => setSelectedAnnouncement(null)} aria-label="Close notice" className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground">×</button></div><p className="mt-5 whitespace-pre-wrap text-sm leading-7 text-foreground">{selectedAnnouncement.content}</p><div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4"><span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Info className="size-3.5" /> {announcementTargetLabel(selectedAnnouncement.target)}</span><button type="button" onClick={() => setSelectedAnnouncement(null)} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Close</button></div></div></div>}
    </div>
  );
}
