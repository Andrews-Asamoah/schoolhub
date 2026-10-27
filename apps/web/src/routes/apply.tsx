import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { GUARDIAN_RELATIONSHIPS, submitApplicationSchema } from "@schoolhub/shared";
import { apiFetch } from "@/lib/api";
import { getTenantSubdomain } from "@/lib/tenant";

export const Route = createFileRoute("/apply")({
  component: ApplyPage,
});

interface PublicIntake {
  school: { name: string; logo: string | null; motto: string | null; currency: string; email: string | null; phone: string | null };
  cycles: {
    id: string;
    name: string;
    academicYear: string;
    opensAt: string;
    closesAt: string;
    instructions: string | null;
    admissionFee: number;
    classes: { classId: string; name: string }[];
  }[];
}
interface Submitted {
  applicationNumber: string;
  className: string;
  cycleName: string;
  admissionFee: number;
  currency: string;
}
const money = (value: number, currency: string) =>
  new Intl.NumberFormat("en-GH", { style: "currency", currency }).format(value);
interface Tracked {
  applicationNumber: string;
  applicantName: string;
  className: string;
  cycleName: string;
  status: string;
  submittedAt: string;
  examDate: string | null;
  examVenue: string | null;
  decisionNote: string | null;
  feeStatus: "NOT_REQUIRED" | "PENDING" | "PAID" | "EXEMPTED";
  feeDue: number;
  currency: string;
}

const field =
  "mt-1.5 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";
const lbl = "block text-xs font-semibold text-foreground/80";
const errorText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

const STATUS_MESSAGE: Record<string, string> = {
  SUBMITTED: "We have received your application. The school will review it shortly.",
  UNDER_REVIEW: "Your application is being reviewed.",
  EXAM_SCHEDULED: "Your child has been scheduled for the entrance examination.",
  EXAM_COMPLETED: "The entrance examination is complete. A decision will be communicated soon.",
  ACCEPTED: "Congratulations! Your child has been accepted. The school will issue the admission details and portal login.",
  WAITLISTED: "Your child has been placed on the waiting list. The school will contact you if a place opens.",
  REJECTED: "Unfortunately the application was not successful this time.",
  ADMITTED: "Admission granted. The school has created your child’s portal account. Contact the school office for the login details.",
  WITHDRAWN: "This application was withdrawn.",
};

function ApplyPage() {
  const subdomain = getTenantSubdomain();
  const [mode, setMode] = useState<"apply" | "track">("apply");
  const intake = useQuery({
    queryKey: ["admissions-public", subdomain],
    queryFn: () => apiFetch<PublicIntake>(`/admissions/public/${subdomain}`),
    enabled: Boolean(subdomain),
    retry: false,
  });

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6 text-center">
          {intake.data?.school.logo && (
            <img src={intake.data.school.logo} alt="" className="mx-auto mb-3 size-16 rounded-xl object-cover" />
          )}
          <h1 className="text-2xl font-bold text-foreground">{intake.data?.school.name ?? "School admissions"}</h1>
          {intake.data?.school.motto && <p className="mt-1 text-sm text-muted-foreground">{intake.data.school.motto}</p>}
        </header>

        {!subdomain ? (
          <Notice>Open this page from your school’s own address (for example <b>yourschool.schoolhub.gh/apply</b>).</Notice>
        ) : intake.isPending ? (
          <Notice>Loading…</Notice>
        ) : intake.error ? (
          <Notice>{errorText(intake.error)}</Notice>
        ) : (
          <>
            <div className="mb-4 inline-flex rounded-lg border border-input bg-card p-0.5">
              {(["apply", "track"] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setMode(key)}
                  className={`rounded-md px-4 py-2 text-xs font-semibold ${mode === key ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
                >
                  {key === "apply" ? "Apply" : "Track application"}
                </button>
              ))}
            </div>
            {mode === "track" ? (
              <TrackForm subdomain={subdomain} />
            ) : intake.data.cycles.length === 0 ? (
              <Notice>
                Admissions are not open right now. Please check back later
                {intake.data.school.phone ? ` or call ${intake.data.school.phone}` : ""}.
              </Notice>
            ) : (
              <ApplyForm subdomain={subdomain} intake={intake.data} />
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">{children}</div>;
}

function ApplyForm({ subdomain, intake }: { subdomain: string; intake: PublicIntake }) {
  const [cycleId, setCycleId] = useState(intake.cycles[0]!.id);
  const [v, setV] = useState<Record<string, string>>({ gender: "MALE", nationality: "Ghanaian", guardianRelationship: "FATHER" });
  const [declaration, setDeclaration] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<Submitted | null>(null);
  const cycle = intake.cycles.find((c) => c.id === cycleId)!;
  const set = (key: string) => (e: { target: { value: string } }) => setV((cur) => ({ ...cur, [key]: e.target.value }));
  const setSelection = (key: string) => (value: string) => setV((current) => ({ ...current, [key]: value }));

  const submit = useMutation({
    mutationFn: (body: unknown) =>
      apiFetch<Submitted>(`/admissions/public/${subdomain}/applications`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: setDone,
  });

  if (done) {
    return (
      <div className="rounded-2xl border border-success/20 bg-card p-6 text-center">
        <h2 className="text-lg font-bold text-foreground">Application received</h2>
        <p className="mt-2 text-sm text-muted-foreground">Keep this reference number. You will need it, with your phone or email, to track progress.</p>
        <p className="my-4 select-all rounded-lg bg-muted py-3 font-mono text-xl font-bold tracking-wider text-foreground">{done.applicationNumber}</p>
        <p className="text-xs text-muted-foreground">Applied for {done.className} · {done.cycleName}</p>
        {done.admissionFee > 0 && (
          <p className="mt-4 rounded-lg bg-warning/10 p-3 text-xs text-warning">
            Please bring <b>{money(done.admissionFee, done.currency)} in cash</b> on the day of the entrance exam. Fee is non-refundable.
          </p>
        )}
      </div>
    );
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = submitApplicationSchema.safeParse({ ...v, declaration });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Please check the form.");
      return;
    }
    submit.mutate(parsed.data);
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6 rounded-2xl border border-border bg-card p-6">
      <div>
        <h2 className="text-base font-bold text-foreground">Enrollment form</h2>
        {cycle.instructions && <p className="mt-2 whitespace-pre-line rounded-lg bg-primary/10 p-3 text-xs text-primary">{cycle.instructions}</p>}
        {cycle.admissionFee > 0 && (
          <p className="mt-2 rounded-lg bg-warning/10 p-3 text-xs text-warning">
            <b>Entrance exam fee: {money(cycle.admissionFee, intake.school.currency)}</b>, paid in cash at the school when your child comes to write the
            exam. The fee is non-refundable and does not guarantee admission.
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Applications close on {cycle.closesAt.slice(0, 10)}. Admission follows an entrance examination.</p>
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-foreground">Applicant</legend>
        {intake.cycles.length > 1 && (
          <label className={`${lbl} sm:col-span-2`}>
            Intake
            <Select value={cycleId || "__none__"} onValueChange={(value) => { setCycleId(value === "__none__" ? "" : value); setV((current) => ({ ...current, classId: "" })); }}>
              <SelectTrigger aria-label="Admission intake" className={field}><SelectValue placeholder="Choose an intake" /></SelectTrigger>
              <SelectContent>
                {intake.cycles.length ? intake.cycles.map((cycle) => <SelectItem key={cycle.id} value={cycle.id}>{cycle.name}</SelectItem>) : <SelectItem value="__none__" disabled>No open intakes available</SelectItem>}
              </SelectContent>
            </Select>
          </label>
        )}
        <label className={`${lbl} sm:col-span-2`}>
          Class applying for
          <Select value={v.classId || "__none__"} onValueChange={(value) => setSelection("classId")(value === "__none__" ? "" : value)}>
            <SelectTrigger aria-label="Class applying for" className={field}><SelectValue placeholder="Choose a class…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Choose a class…</SelectItem>
              {cycle.classes.map((schoolClass) => <SelectItem key={schoolClass.classId} value={schoolClass.classId}>{schoolClass.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label className={lbl}>First name<input className={field} value={v.firstName ?? ""} onChange={set("firstName")} autoComplete="off" /></label>
        <label className={lbl}>Last name<input className={field} value={v.lastName ?? ""} onChange={set("lastName")} autoComplete="off" /></label>
        <label className={lbl}>Other names<input className={field} value={v.otherNames ?? ""} onChange={set("otherNames")} /></label>
        <label className={lbl}>Gender
          <Select value={v.gender} onValueChange={setSelection("gender")}>
            <SelectTrigger aria-label="Student gender" className={field}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="MALE">Male</SelectItem><SelectItem value="FEMALE">Female</SelectItem><SelectItem value="OTHER">Other</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className={lbl}>Date of birth<DatePicker buttonClassName={field} value={v.dateOfBirth ?? ""} onChange={(value) => setV((cur) => ({ ...cur, dateOfBirth: value }))} /></label>
        <label className={lbl}>Nationality<input className={field} value={v.nationality ?? ""} onChange={set("nationality")} /></label>
        <label className={lbl}>Previous school<input className={field} value={v.previousSchool ?? ""} onChange={set("previousSchool")} /></label>
        <label className={lbl}>Last class completed<input className={field} value={v.previousClass ?? ""} onChange={set("previousClass")} /></label>
        <label className={`${lbl} sm:col-span-2`}>Residential address<input className={field} value={v.residentialAddress ?? ""} onChange={set("residentialAddress")} /></label>
        <label className={lbl}>City / town<input className={field} value={v.city ?? ""} onChange={set("city")} /></label>
        <label className={lbl}>Region<input className={field} value={v.region ?? ""} onChange={set("region")} /></label>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-foreground">Parent / guardian</legend>
        <label className={lbl}>First name<input className={field} value={v.guardianFirstName ?? ""} onChange={set("guardianFirstName")} /></label>
        <label className={lbl}>Last name<input className={field} value={v.guardianLastName ?? ""} onChange={set("guardianLastName")} /></label>
        <label className={lbl}>Relationship
          <Select value={v.guardianRelationship} onValueChange={setSelection("guardianRelationship")}>
            <SelectTrigger aria-label="Guardian relationship" className={field}><SelectValue /></SelectTrigger>
            <SelectContent>{GUARDIAN_RELATIONSHIPS.map((relationship) => <SelectItem key={relationship} value={relationship}>{relationship.charAt(0) + relationship.slice(1).toLowerCase()}</SelectItem>)}</SelectContent>
          </Select>
        </label>
        <label className={lbl}>Phone<input type="tel" className={field} value={v.guardianPhone ?? ""} onChange={set("guardianPhone")} /></label>
        <label className={`${lbl} sm:col-span-2`}>Email (recommended: used for the parent portal)
          <input type="email" className={field} value={v.guardianEmail ?? ""} onChange={set("guardianEmail")} />
        </label>
      </fieldset>

      {/* Honeypot: hidden from people, irresistible to bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Website<input tabIndex={-1} autoComplete="off" value={v.website ?? ""} onChange={set("website")} /></label>
      </div>

      <label className="flex items-start gap-2 text-xs text-foreground/80">
        <input type="checkbox" className="mt-0.5" checked={declaration} onChange={(e) => setDeclaration(e.target.checked)} />
        I confirm the information above is correct and agree to the school processing it for admission purposes.
      </label>

      {(formError || submit.error) && <p role="alert" className="text-sm text-destructive">{formError ?? errorText(submit.error)}</p>}
      <button type="submit" disabled={submit.isPending} className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
        {submit.isPending ? "Submitting…" : "Submit application"}
      </button>
    </form>
  );
}

function TrackForm({ subdomain }: { subdomain: string }) {
  const [applicationNumber, setNumber] = useState("");
  const [contact, setContact] = useState("");
  const track = useMutation({
    mutationFn: () =>
      apiFetch<Tracked>(`/admissions/public/${subdomain}/track`, {
        method: "POST",
        body: JSON.stringify({ applicationNumber, contact }),
      }),
  });
  const result = track.data;
  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <h2 className="text-base font-bold text-foreground">Track your application</h2>
      <label className={lbl}>Reference number<input className={field} value={applicationNumber} onChange={(e) => setNumber(e.target.value)} placeholder="ABC-A26-00001" /></label>
      <label className={lbl}>Phone number or email used to apply<input className={field} value={contact} onChange={(e) => setContact(e.target.value)} /></label>
      <button type="button" className="h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60" disabled={track.isPending || applicationNumber.length < 5 || contact.length < 5} onClick={() => track.mutate()}>
        {track.isPending ? "Checking…" : "Check status"}
      </button>
      {track.error && <p role="alert" className="text-sm text-destructive">{errorText(track.error)}</p>}
      {result && (
        <div className="rounded-xl bg-muted/50 p-4 text-sm text-foreground/80">
          <p className="font-semibold text-foreground">{result.applicantName} · {result.className}</p>
          <p className="mt-1 text-xs text-muted-foreground">{result.applicationNumber} · {result.cycleName}</p>
          <p className="mt-3">{STATUS_MESSAGE[result.status] ?? result.status}</p>
          {result.feeStatus === "PENDING" && (
            <p className="mt-2 text-warning">Entrance exam fee of {money(result.feeDue, result.currency)} is payable in cash on exam day.</p>
          )}
          {result.feeStatus === "PAID" && <p className="mt-2 text-success">Entrance exam fee received. Thank you.</p>}
          {result.feeStatus === "EXEMPTED" && <p className="mt-2 text-info">Entrance exam fee waived by the school.</p>}
          {result.examDate && <p className="mt-2 font-semibold">Exam: {new Date(result.examDate).toLocaleString()} at {result.examVenue}</p>}
          {result.decisionNote && <p className="mt-2 italic">“{result.decisionNote}”</p>}
        </div>
      )}
    </div>
  );
}
