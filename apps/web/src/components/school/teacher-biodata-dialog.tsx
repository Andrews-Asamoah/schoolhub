import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, Lock, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { apiFetch } from "@/lib/api";

interface TeacherBiodata {
  id: string;
  teacherId: string;
  staffNumber: string | null;
  isActive: boolean;
  firstName: string;
  lastName: string;
  otherNames: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  image: string | null;
  department: { id: string; name: string };
  qualification: string | null;
  specialization: string | null;
  experience: number | null;
  employmentType: string;
  hireDate: string;
  contractEndDate: string | null;
  subjects: { id: string; name: string }[];
  /** Only sent to owners, administrators and headmistresses. */
  private: {
    alternatePhone: string | null;
    nationality: string | null;
    residentialAddress: string | null;
    postalAddress: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    emergencyRelationship: string | null;
  } | null;
}

const DASH = "—";
const text = (value?: string | null) => (value?.trim() ? value : DASH);
const date = (value?: string | null) =>
  value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : DASH;
const words = (value?: string | null) =>
  value ? value.toLowerCase().replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase()) : DASH;

/** A teacher's biodata sheet. Address and emergency contact appear only for school managers. */
export function TeacherBiodataDialog({
  teacherId,
  fallbackName,
  onClose,
}: {
  teacherId: string;
  fallbackName: string;
  onClose: () => void;
}) {
  const query = useQuery({
    queryKey: ["people", "teachers", "biodata", teacherId],
    queryFn: () => apiFetch<TeacherBiodata>(`/people/teachers/${teacherId}`),
    retry: false,
  });
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);

  const data = query.data;
  const fullName = data ? [data.firstName, data.otherNames, data.lastName].filter(Boolean).join(" ") : fallbackName;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="biodata-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-5 text-card-foreground shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <UserAvatar name={fullName} image={data?.image} className="size-16 text-xl" />
            <div className="min-w-0">
              <h2 id="biodata-title" className="truncate text-base font-bold text-foreground">{fullName}</h2>
              {data && (
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {data.teacherId}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      data.isActive ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {data.isActive ? "Active" : "Inactive"}
                  </span>
                </p>
              )}
            </div>
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>

        {query.isPending && (
          <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Loading biodata…
          </p>
        )}
        {query.error && (
          <p role="alert" className="mt-6 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            Biodata could not be loaded: {query.error.message}
          </p>
        )}

        {data && (
          <div className="mt-5 space-y-5">
            <Section title="Personal">
              <Field label="Gender" value={words(data.gender)} />
              <Field label="Date of birth" value={date(data.dateOfBirth)} />
              <Field label="Nationality" value={text(data.private?.nationality)} hidden={!data.private} />
            </Section>

            <Section title="Contact">
              <Field label="Phone" value={text(data.phone)} />
              <Field label="Alternate phone" value={text(data.private?.alternatePhone)} hidden={!data.private} />
              <Field label="Email" value={text(data.email)} />
              <Field
                label="Residential address"
                value={text(data.private?.residentialAddress)}
                hidden={!data.private}
                wide
              />
              <Field label="Postal address" value={text(data.private?.postalAddress)} hidden={!data.private} />
              <Field
                label="City / region"
                value={[data.private?.city, data.private?.region].filter(Boolean).join(", ") || DASH}
                hidden={!data.private}
              />
            </Section>

            <Section title="Employment">
              <Field label="Department" value={text(data.department.name)} />
              <Field label="Staff number" value={text(data.staffNumber)} />
              <Field label="Qualification" value={text(data.qualification)} />
              <Field label="Specialization" value={text(data.specialization)} />
              <Field
                label="Experience"
                value={data.experience == null ? DASH : `${data.experience} year${data.experience === 1 ? "" : "s"}`}
              />
              <Field label="Employment type" value={words(data.employmentType)} />
              <Field label="Hire date" value={date(data.hireDate)} />
              <Field label="Contract ends" value={date(data.contractEndDate)} />
            </Section>

            <Section title="Subjects">
              <div className="sm:col-span-2">
                {data.subjects.length ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {data.subjects.map((subject) => (
                      <li key={subject.id} className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground">
                        {subject.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">Not assigned to any subject yet.</p>
                )}
              </div>
            </Section>

            {data.private ? (
              <Section title="Emergency contact">
                <Field label="Name" value={text(data.private.emergencyContactName)} />
                <Field label="Phone" value={text(data.private.emergencyContactPhone)} />
                <Field label="Relationship" value={text(data.private.emergencyRelationship)} />
              </Section>
            ) : (
              <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-[11px] text-muted-foreground">
                <Lock className="size-3.5 shrink-0" />
                Home address and emergency contact are visible to school administrators only.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="border-b border-border pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function Field({ label, value, hidden, wide }: { label: string; value: string; hidden?: boolean; wide?: boolean }) {
  if (hidden) return null;
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}
