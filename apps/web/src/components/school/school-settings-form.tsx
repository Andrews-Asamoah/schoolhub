import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateSchoolSettingsSchema } from "@schoolhub/shared";
import { LoaderCircle, Pencil } from "lucide-react";
import { useState, type FormEvent } from "react";
import { FormField, FormInput, FormTextarea } from "@/components/forms/form-controls";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import { apiFetch } from "@/lib/api";

export interface SchoolDetails {
  id: string;
  name: string;
  code: string;
  subdomain: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  motto?: string | null;
  website?: string | null;
}

const EDITABLE = ["name", "email", "phone", "website", "address", "motto"] as const;
type Field = (typeof EDITABLE)[number];

const toValues = (school: SchoolDetails): Record<Field, string> => ({
  name: school.name,
  email: school.email ?? "",
  phone: school.phone ?? "",
  website: school.website ?? "",
  address: school.address ?? "",
  motto: school.motto ?? "",
});

/**
 * School details. Owners and admins can edit the public details; the school
 * code and web address identify the school everywhere, so they stay read-only.
 */
export function SchoolSettingsForm({ school }: { school: SchoolDetails }) {
  const { activeRole } = useSchoolRole();
  const canEdit = activeRole === "owner" || activeRole === "admin";
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(() => toValues(school));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (body: unknown) => apiFetch("/schools/current", { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: async () => {
      setEditing(false);
      setSaved(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["school"] }),
        queryClient.invalidateQueries({ queryKey: ["tenant"] }),
      ]);
    },
  });

  function startEditing() {
    setValues(toValues(school));
    setErrors({});
    setSaved(false);
    save.reset();
    setEditing(true);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = updateSchoolSettingsSchema.safeParse(values);
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as Field;
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  }

  const set = (field: Field) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  const readOnly: [string, string][] = [
    ["School name", school.name],
    ["School code", school.code],
    ["Subdomain", school.subdomain],
    ["Email", school.email || "Not set"],
    ["Phone", school.phone || "Not set"],
    ["Address", school.address || "Not set"],
    ["Motto", school.motto || "Not set"],
    ["Website", school.website || "Not set"],
  ];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">School profile</h2>
          <p className="mt-1 text-xs text-muted-foreground">Current details for your active school.</p>
        </div>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-[11px] font-semibold text-foreground/80 hover:bg-muted/50"
          >
            <Pencil className="size-3.5" /> Edit details
          </button>
        )}
      </div>

      {saved && !editing && (
        <p role="status" className="mt-3 text-xs text-success">School details saved.</p>
      )}

      {editing ? (
        <form onSubmit={submit} noValidate className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="School name" htmlFor="school-name" error={errors.name}>
              <FormInput id="school-name" value={values.name} onChange={set("name")} maxLength={120} />
            </FormField>
            <FormField label="Email" htmlFor="school-email" error={errors.email}>
              <FormInput id="school-email" type="email" value={values.email} onChange={set("email")} />
            </FormField>
            <FormField label="Phone" htmlFor="school-phone" error={errors.phone}>
              <FormInput id="school-phone" type="tel" value={values.phone} onChange={set("phone")} />
            </FormField>
            <FormField label="Website" htmlFor="school-website" error={errors.website} hint="For example www.yourschool.edu.gh">
              <FormInput id="school-website" value={values.website} onChange={set("website")} />
            </FormField>
            <FormField label="Address" htmlFor="school-address" error={errors.address} className="sm:col-span-2">
              <FormTextarea id="school-address" rows={2} value={values.address} onChange={set("address")} />
            </FormField>
            <FormField label="Motto" htmlFor="school-motto" error={errors.motto} className="sm:col-span-2">
              <FormInput id="school-motto" value={values.motto} onChange={set("motto")} maxLength={150} />
            </FormField>
          </div>
          <p className="text-[11px] text-muted-foreground">
            The school code ({school.code}) and subdomain ({school.subdomain}) identify your school and cannot be changed here.
          </p>
          {save.error && (
            <p role="alert" className="text-xs text-destructive">{save.error.message}</p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={save.isPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {save.isPending && <LoaderCircle className="size-3.5 animate-spin" />}
              Save changes
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-xs font-semibold text-foreground/80 hover:bg-muted/50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <dl className="mt-5 grid gap-x-8 sm:grid-cols-2">
          {readOnly.map(([label, value]) => (
            <div key={label} className="border-b border-border/60 py-3 first:pt-0">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">{label}</dt>
              <dd className="mt-1 text-xs font-medium text-foreground/80">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
