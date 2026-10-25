import { useQuery } from "@tanstack/react-query";
import { Check, Copy, X } from "lucide-react";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

export interface StudentProfileData {
  id: string;
  studentId: string;
  admissionNumber: string | null;
  username: string | null;
  loginEmail: string | null;
  status: string;
  admissionDate: string | null;
  profile: {
    firstName: string;
    lastName: string;
    otherNames: string | null;
    gender: string | null;
    dateOfBirth: string | null;
    nationality: string | null;
    residentialAddress: string | null;
    city: string | null;
    region: string | null;
    email: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    emergencyRelationship: string | null;
  };
  class: { id: string; name: string; level?: string } | null;
  department: { id: string; name: string } | null;
  house: { id: string; name: string } | null;
  previousSchool: string | null;
  previousClass: string | null;
  health: { bloodGroup: string | null; allergies: string | null; medicalConditions: string | null };
  guardians: { id: string; name: string; relationshipType: string; isPrimary: boolean; phone?: string | null; email?: string | null }[];
  subjects: { subjectId: string; name: string; code: string; isCompulsory: boolean; teacherName: string | null }[];
}

const text = (value: string | null | undefined) => (value && value.trim() ? value : "Not recorded");
const nice = (value: string | null | undefined) =>
  value ? value.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : "Not recorded";
const date = (value: string | null | undefined) => (value ? new Date(value).toLocaleDateString() : "Not recorded");

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{value}</dd>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 flex items-center gap-2">
        <span className="break-all font-mono text-sm text-foreground">{value ?? "Not generated"}</span>
        {value && (
          <button
            type="button"
            aria-label={`Copy ${label}`}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
            onClick={() => {
              void navigator.clipboard?.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          </button>
        )}
      </dd>
    </div>
  );
}

const card = "rounded-2xl border border-border bg-card p-4";
const heading = "mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground";

export function StudentProfileCard({ data }: { data: StudentProfileData }) {
  const p = data.profile;
  const fullName = [p.firstName, p.otherNames, p.lastName].filter(Boolean).join(" ");
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-primary-foreground">
          {p.firstName.charAt(0)}
          {p.lastName.charAt(0)}
        </div>
        <div>
          <h3 className="text-lg font-bold text-foreground">{fullName}</h3>
          <p className="text-xs text-muted-foreground">
            {data.class?.name ?? "No class this term"}
            {data.admissionNumber ? ` · Admission no. ${data.admissionNumber}` : ""} · {nice(data.status)}
          </p>
        </div>
      </div>

      <section className={card}>
        <h4 className={heading}>Sign-in</h4>
        <dl className="grid gap-3 sm:grid-cols-2">
          <CopyField label="Username" value={data.username ?? data.admissionNumber} />
          <CopyField label="Login email" value={data.loginEmail ?? p.email} />
        </dl>
      </section>

      <section className={card}>
        <h4 className={heading}>Personal details</h4>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Field label="Date of birth" value={date(p.dateOfBirth)} />
          <Field label="Gender" value={nice(p.gender)} />
          <Field label="Nationality" value={text(p.nationality)} />
          <Field label="Address" value={[p.residentialAddress, p.city, p.region].filter(Boolean).join(", ") || "Not recorded"} />
          <Field label="Department" value={text(data.department?.name)} />
          <Field label="House" value={text(data.house?.name)} />
          <Field label="Previous school" value={text(data.previousSchool)} />
          <Field label="Admitted" value={date(data.admissionDate)} />
          <Field
            label="Emergency contact"
            value={p.emergencyContactName ? `${p.emergencyContactName} (${nice(p.emergencyRelationship)}) ${p.emergencyContactPhone ?? ""}` : "Not recorded"}
          />
        </dl>
      </section>

      <section className={card}>
        <h4 className={heading}>Health</h4>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Field label="Blood group" value={text(data.health.bloodGroup)} />
          <Field label="Allergies" value={text(data.health.allergies)} />
          <Field label="Medical conditions" value={text(data.health.medicalConditions)} />
        </dl>
      </section>

      <section className={card}>
        <h4 className={heading}>Parents / guardians</h4>
        {data.guardians.length === 0 ? (
          <p className="text-sm text-muted-foreground">No guardian linked yet.</p>
        ) : (
          <ul className="space-y-2">
            {data.guardians.map((g) => (
              <li key={g.id} className="text-sm text-foreground">
                <span className="font-semibold">{g.name}</span> · {nice(g.relationshipType)}
                {g.isPrimary ? " (primary)" : ""}
                {(g.phone || g.email) && (
                  <span className="block text-xs text-muted-foreground">{[g.phone, g.email].filter(Boolean).join(" · ")}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h4 className={heading}>Subjects (inherited from {data.class?.name ?? "the class"})</h4>
        {data.subjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No subjects are linked to this class yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {data.subjects.map((subject) => (
              <li key={subject.subjectId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-foreground">
                  {subject.name} <span className="text-xs text-muted-foreground">{subject.code}</span>
                </span>
                <span className="text-xs text-muted-foreground">{subject.teacherName ?? "Teacher not assigned"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Staff and teachers: open a student's profile from the directory. */
export function StudentProfileModal({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const query = useQuery({
    queryKey: ["students", "profile", studentId],
    queryFn: () => apiFetch<StudentProfileData>(`/students/${studentId}/profile`),
    retry: false,
  });
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-overlay p-4">
      <div className="my-6 w-full max-w-2xl rounded-2xl bg-muted/50 p-5 shadow-xl">
        <div className="mb-3 flex justify-end">
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted-foreground/20">
            <X className="size-4" />
          </button>
        </div>
        {query.isPending ? (
          <p className="text-sm text-muted-foreground">Loading profile…</p>
        ) : query.error ? (
          <p role="alert" className="text-sm text-destructive">{query.error instanceof Error ? query.error.message : "Could not load the profile."}</p>
        ) : (
          <StudentProfileCard data={query.data} />
        )}
      </div>
    </div>
  );
}

/** Parent / guardian portal: live records for each linked child. */
export function MyWardsPanel() {
  const query = useQuery({
    queryKey: ["students", "my-wards"],
    queryFn: () => apiFetch<StudentProfileData[]>("/students/my-wards"),
    retry: false,
  });
  const [openId, setOpenId] = useState<string | null>(null);
  if (query.isPending || query.error || query.data.length === 0) return null;
  const selected = query.data.find((w) => w.id === openId) ?? null;
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-bold text-foreground">My children: school records</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">Details held by the school. Contact the school office to correct anything.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {query.data.map((ward) => (
          <button
            key={ward.id}
            type="button"
            onClick={() => setOpenId(openId === ward.id ? null : ward.id)}
            className={`rounded-xl border px-3 py-2 text-left text-sm ${openId === ward.id ? "border-primary bg-primary/10" : "border-border"}`}
          >
            <span className="font-semibold text-foreground">
              {ward.profile.firstName} {ward.profile.lastName}
            </span>
            <span className="block text-xs text-muted-foreground">{ward.class?.name ?? "No class this term"}</span>
          </button>
        ))}
      </div>
      {selected && (
        <div className="mt-4">
          <StudentProfileCard data={selected} />
        </div>
      )}
    </section>
  );
}

/** Student portal: my own sign-in details and record. */
export function MyProfilePanel() {
  const query = useQuery({
    queryKey: ["students", "me"],
    queryFn: () => apiFetch<StudentProfileData>("/students/me"),
    retry: false,
  });
  if (query.isPending || query.error) return null;
  return (
    <section className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-bold text-foreground">My profile</h2>
      <StudentProfileCard data={query.data} />
    </section>
  );
}
