import { SchoolSmsFields, emptySchoolSms } from "@/components/school/school-sms-fields";
import { schoolHubtelConnectionSchema } from "@schoolhub/shared";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Building2, User } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { IssuedCredentials } from "@schoolhub/shared";
import {
  CredentialsDialog,
  type CredentialEntry,
} from "@/components/credentials/credentials-dialog";
import type { EnrollSchoolInput } from "@schoolhub/shared";

type FormErrors = Partial<Record<keyof EnrollSchoolInput, string>>;

function toKebab(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function toSchoolCode(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 20);
}

export function EnrollSchoolForm() {
  const navigate = useNavigate();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});

  const [form, setForm] = useState<EnrollSchoolInput>({
    schoolName: "",
    schoolCode: "",
    schoolEmail: "",
    schoolPhone: "",
    schoolAddress: "",
    subdomain: "",
    region: "",
    adminName: "",
    adminEmail: "",
  });

  const [includeSms, setIncludeSms] = useState(false);
  const [sms, setSms] = useState(emptySchoolSms);
  const [issued, setIssued] = useState<CredentialEntry[]>([]);
  const mutation = useMutation({
    gcTime: 0,
    mutationFn: (data: EnrollSchoolInput) =>
      apiFetch<{ school: { id: string }; credentials: IssuedCredentials }>("/super-admin/schools", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (result) => {
      setSms(emptySchoolSms());
      setIncludeSms(false);
      mutation.reset();
      setSubmitError(null);
      setSuccessMsg("School enrolled successfully!");
      // Navigation waits until the one-time credentials have been saved.
      setIssued([
        {
          label: `${form.adminName} (school owner)`,
          credentials: result.credentials,
        },
      ]);
    },
    onError: (err: Error) => {
      setSubmitError(err.message || "Please check the details and try again.");
    },
  });

  function set(field: keyof EnrollSchoolInput, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Auto-derive subdomain and code from school name
      if (field === "schoolName") {
        if (!prev.subdomain || prev.subdomain === toKebab(prev.schoolName)) {
          next.subdomain = toKebab(value);
        }
        if (!prev.schoolCode || prev.schoolCode === toSchoolCode(prev.schoolName)) {
          next.schoolCode = toSchoolCode(value);
        }
      }
      return next;
    });
    setErrors((e) => ({ ...e, [field]: undefined }));
    setSubmitError(null);
  }

  function validate(): boolean {
    const errs: FormErrors = {};
    if (!form.schoolName || form.schoolName.length < 2) errs.schoolName = "School name must be at least 2 characters";
    if (!form.schoolCode || !/^[A-Z0-9-]{3,20}$/.test(form.schoolCode)) errs.schoolCode = "3-20 uppercase letters, numbers, hyphens";
    if (!form.subdomain || !/^[a-z0-9-]{3,30}$/.test(form.subdomain)) errs.subdomain = "3-30 lowercase letters, numbers, hyphens";
    if (form.schoolEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.schoolEmail)) errs.schoolEmail = "Invalid email";
    if (!form.adminName || form.adminName.length < 2) errs.adminName = "Admin name must be at least 2 characters";
    if (!form.adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.adminEmail)) errs.adminEmail = "Valid email required";
    if (includeSms) { const parsed = schoolHubtelConnectionSchema.safeParse(sms); if (!parsed.success) errs.smsConnection = parsed.error.issues[0]?.message; }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;
    // Strip empty optional strings
    const payload: EnrollSchoolInput = {
      ...form,
      schoolEmail: form.schoolEmail || undefined,
      schoolPhone: form.schoolPhone || undefined,
      schoolAddress: form.schoolAddress || undefined,
      region: form.region || undefined,
      smsConnection: includeSms ? sms : undefined,
    };
    mutation.mutate(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <CredentialsDialog
        entries={issued}
        onClose={() => {
          setIssued([]);
          void navigate({ to: "/admin/schools" });
        }}
      />
      {successMsg && (
        <div role="status" className="rounded-xl border border-success/20 bg-success/10 p-4 text-sm font-medium text-success">
          {successMsg}
        </div>
      )}
      {submitError && (
        <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          <span className="font-semibold">School enrollment failed.</span>{" "}
          {submitError}
        </div>
      )}

      {/* School Details Section */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Building2 className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-foreground">School Details</h2>
            <p className="text-xs text-muted-foreground">Basic information about the school</p>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <FieldGroup label="School Name *" error={errors.schoolName}>
            <input
              type="text"
              placeholder="Accra Preparatory School"
              value={form.schoolName}
              onChange={(e) => set("schoolName", e.target.value)}
              className={inputClass(!!errors.schoolName)}
            />
          </FieldGroup>

          <FieldGroup label="School Code *" error={errors.schoolCode} hint="Uppercase, e.g. ACC-PREP-001">
            <input
              type="text"
              placeholder="ACC-PREP-001"
              value={form.schoolCode}
              onChange={(e) => set("schoolCode", e.target.value.toUpperCase())}
              className={inputClass(!!errors.schoolCode)}
            />
          </FieldGroup>

          <FieldGroup label="Subdomain *" error={errors.subdomain} hint="e.g. accra-prep → accra-prep.schoolhub.gh">
            <input
              type="text"
              placeholder="accra-prep"
              value={form.subdomain}
              onChange={(e) => set("subdomain", e.target.value.toLowerCase())}
              className={inputClass(!!errors.subdomain)}
            />
          </FieldGroup>

          <FieldGroup label="Ghana Region" error={errors.region}>
            <select
              value={form.region}
              onChange={(e) => set("region", e.target.value)}
              className={inputClass(false)}
            >
              <option value="">Select region…</option>
              {ghanaRegions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </FieldGroup>

          <FieldGroup label="School Email" error={errors.schoolEmail}>
            <input
              type="email"
              placeholder="info@school.edu.gh"
              value={form.schoolEmail}
              onChange={(e) => set("schoolEmail", e.target.value)}
              className={inputClass(!!errors.schoolEmail)}
            />
          </FieldGroup>

          <FieldGroup label="School Phone">
            <input
              type="tel"
              placeholder="+233 24 000 0000"
              value={form.schoolPhone}
              onChange={(e) => set("schoolPhone", e.target.value)}
              className={inputClass(false)}
            />
          </FieldGroup>

          <div className="sm:col-span-2">
            <FieldGroup label="Address">
              <input
                type="text"
                placeholder="123 Oxford St, Accra"
                value={form.schoolAddress}
                onChange={(e) => set("schoolAddress", e.target.value)}
                className={inputClass(false)}
              />
            </FieldGroup>
          </div>
        </div>
      </section>

      {/* Admin Account Section */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <User className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-foreground">Administrator Account</h2>
            <p className="text-xs text-muted-foreground">Login details for the school owner</p>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <FieldGroup label="Admin Name *" error={errors.adminName}>
            <input
              type="text"
              placeholder="Kwame Mensah"
              value={form.adminName}
              onChange={(e) => set("adminName", e.target.value)}
              className={inputClass(!!errors.adminName)}
            />
          </FieldGroup>

          <FieldGroup label="Admin Email *" error={errors.adminEmail}>
            <input
              type="email"
              placeholder="kwame@school.edu.gh"
              value={form.adminEmail}
              onChange={(e) => set("adminEmail", e.target.value)}
              className={inputClass(!!errors.adminEmail)}
            />
          </FieldGroup>
        </div>
        <p className="mt-5 rounded-lg border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
          A random one-time password is generated and shown once after enrolment. The owner must replace it at first sign-in. The school starts on a 30-day trial.
          Share it securely with the administrator.
        </p>
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm"><h2 className="text-base font-semibold text-foreground">School-funded SMS (optional)</h2><p className="text-xs leading-5 text-muted-foreground">Connect this school's Hubtel account and approved sender name. The school tops up its own Programmable SMS credit in Hubtel. SMS starts disabled; the owner enables it with a daily limit after enrollment. Details can also be added later.</p><label className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={includeSms} onChange={event=>setIncludeSms(event.target.checked)} />Configure this school's Hubtel account now</label>{includeSms&&<SchoolSmsFields value={sms} onChange={setSms} disabled={mutation.isPending}/>} {errors.smsConnection&&<p role="alert" className="text-xs text-destructive">{errors.smsConnection}</p>}</section>
      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => void navigate({ to: "/admin/schools" })}
          className="superadmin-button-secondary rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted/50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="superadmin-button-primary rounded-xl bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 disabled:opacity-60"
        >
          {mutation.isPending ? "Enrolling school…" : "Enroll School"}
        </button>
      </div>
    </form>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function inputClass(hasError: boolean) {
  return [
    "w-full rounded-lg border px-3 py-2 text-sm transition",
    "focus:outline-none focus:ring-2",
    hasError
      ? "border-destructive/30 focus:border-destructive/50 focus:ring-destructive/20"
      : "border-input focus:border-primary/50 focus:ring-primary/20",
  ].join("  ");
}

function FieldGroup({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-foreground/80">{label}</label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground/70">{hint}</p>}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

const ghanaRegions = [
  "Greater Accra",
  "Ashanti",
  "Western",
  "Central",
  "Eastern",
  "Volta",
  "Brong-Ahafo",
  "Northern",
  "Upper East",
  "Upper West",
  "Oti",
  "Bono East",
  "Ahafo",
  "Savannah",
  "North East",
  "Western North",
];
