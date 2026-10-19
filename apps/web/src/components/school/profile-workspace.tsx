import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { updateMyProfileSchema } from "@schoolhub/shared";
import { LoaderCircle, Lock } from "lucide-react";
import { useState, type FormEvent } from "react";
import { FormField, FormInput, FormTextarea } from "@/components/forms/form-controls";
import { ProfilePhotoControls } from "@/components/school/profile-photo-controls";
import { schoolRoleLabel, useSchoolRole } from "@/components/school/school-role-switcher";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";

interface ProfileDetails {
  firstName: string;
  lastName: string;
  otherNames: string | null;
  phone: string | null;
  alternatePhone: string | null;
  residentialAddress: string | null;
  city: string | null;
  region: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyRelationship: string | null;
}

interface ProfileResponse {
  user: { name: string; email: string; image: string | null };
  profile: ProfileDetails;
  canEditName: boolean;
}

type Field = keyof ProfileDetails;
const PROFILE_KEY = ["school", "me", "profile"];

const toValues = (profile: ProfileDetails): Record<Field, string> => ({
  firstName: profile.firstName,
  lastName: profile.lastName,
  otherNames: profile.otherNames ?? "",
  phone: profile.phone ?? "",
  alternatePhone: profile.alternatePhone ?? "",
  residentialAddress: profile.residentialAddress ?? "",
  city: profile.city ?? "",
  region: profile.region ?? "",
  emergencyContactName: profile.emergencyContactName ?? "",
  emergencyContactPhone: profile.emergencyContactPhone ?? "",
  emergencyRelationship: profile.emergencyRelationship ?? "",
});

const card = "rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 dark:border-white/10 dark:bg-slate-900/70";

/** "My profile": every signed-in user's own photo and basic contact details. */
export function ProfileWorkspace() {
  const query = useQuery({
    queryKey: PROFILE_KEY,
    queryFn: () => apiFetch<ProfileResponse>("/schools/current/me/profile"),
    retry: false,
  });

  if (query.isPending) return <p className="text-xs text-slate-500">Loading your profile…</p>;
  if (query.error) return <p role="alert" className="text-xs text-rose-700">{query.error.message}</p>;
  return <ProfileForm data={query.data} />;
}

function ProfileForm({ data }: { data: ProfileResponse }) {
  const { activeRole } = useSchoolRole();
  const { refetch: refetchSession } = useSession();
  const queryClient = useQueryClient();
  const [values, setValues] = useState(() => toValues(data.profile));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (body: unknown) =>
      apiFetch<ProfileResponse>("/schools/current/me/profile", { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: async (result) => {
      queryClient.setQueryData(PROFILE_KEY, result);
      setValues(toValues(result.profile));
      setSaved(true);
      await refetchSession(); // the header shows the name
    },
  });

  const set = (field: Field) => (event: { target: { value: string } }) => {
    setSaved(false);
    setValues((current) => ({ ...current, [field]: event.target.value }));
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    // Locked names are never sent, so a student cannot change theirs even by editing the page.
    const { firstName, lastName, otherNames, ...rest } = values;
    const parsed = updateMyProfileSchema.safeParse(
      data.canEditName ? { firstName, lastName, otherNames, ...rest } : rest,
    );
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) next[issue.path[0] as Field] ??= issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  }

  const nameHint = data.canEditName ? undefined : "Your name is part of the school's records. Ask the school office to change it.";

  return (
    <div className="space-y-5">
      <section className={card} aria-labelledby="profile-photo-heading">
        <h2 id="profile-photo-heading" className="text-sm font-semibold text-slate-900 dark:text-slate-100">Profile photo</h2>
        <p className="mb-4 mt-1 text-xs text-slate-500">
          {data.user.name} · {schoolRoleLabel(activeRole)}
        </p>
        <ProfilePhotoControls avatarClassName="size-20 text-2xl" />
      </section>

      <form onSubmit={submit} noValidate className="space-y-5">
        <section className={card} aria-labelledby="profile-details-heading">
          <h2 id="profile-details-heading" className="text-sm font-semibold text-slate-900 dark:text-slate-100">Personal details</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FormField label="First name" htmlFor="me-first" error={errors.firstName} hint={nameHint}>
              <FormInput id="me-first" value={values.firstName} onChange={set("firstName")} disabled={!data.canEditName} />
            </FormField>
            <FormField label="Last name" htmlFor="me-last" error={errors.lastName}>
              <FormInput id="me-last" value={values.lastName} onChange={set("lastName")} disabled={!data.canEditName} />
            </FormField>
            <FormField label="Other names" htmlFor="me-other" error={errors.otherNames}>
              <FormInput id="me-other" value={values.otherNames} onChange={set("otherNames")} disabled={!data.canEditName} />
            </FormField>
            <FormField label="Email" htmlFor="me-email" hint="Your sign-in email. Ask your school administrator to change it.">
              <div className="relative">
                <FormInput id="me-email" value={data.user.email} readOnly disabled className="pr-9" />
                <Lock className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
              </div>
            </FormField>
            <FormField label="Phone" htmlFor="me-phone" error={errors.phone}>
              <FormInput id="me-phone" type="tel" value={values.phone} onChange={set("phone")} />
            </FormField>
            <FormField label="Alternate phone" htmlFor="me-alt" error={errors.alternatePhone}>
              <FormInput id="me-alt" type="tel" value={values.alternatePhone} onChange={set("alternatePhone")} />
            </FormField>
            <FormField label="Residential address" htmlFor="me-address" error={errors.residentialAddress} className="sm:col-span-2">
              <FormTextarea id="me-address" rows={2} value={values.residentialAddress} onChange={set("residentialAddress")} />
            </FormField>
            <FormField label="City" htmlFor="me-city" error={errors.city}>
              <FormInput id="me-city" value={values.city} onChange={set("city")} />
            </FormField>
            <FormField label="Region" htmlFor="me-region" error={errors.region}>
              <FormInput id="me-region" value={values.region} onChange={set("region")} />
            </FormField>
          </div>
        </section>

        <section className={card} aria-labelledby="profile-emergency-heading">
          <h2 id="profile-emergency-heading" className="text-sm font-semibold text-slate-900 dark:text-slate-100">Emergency contact</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <FormField label="Name" htmlFor="me-ec-name" error={errors.emergencyContactName}>
              <FormInput id="me-ec-name" value={values.emergencyContactName} onChange={set("emergencyContactName")} />
            </FormField>
            <FormField label="Phone" htmlFor="me-ec-phone" error={errors.emergencyContactPhone}>
              <FormInput id="me-ec-phone" type="tel" value={values.emergencyContactPhone} onChange={set("emergencyContactPhone")} />
            </FormField>
            <FormField label="Relationship" htmlFor="me-ec-rel" error={errors.emergencyRelationship}>
              <FormInput id="me-ec-rel" value={values.emergencyRelationship} onChange={set("emergencyRelationship")} />
            </FormField>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={save.isPending}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {save.isPending && <LoaderCircle className="size-3.5 animate-spin" />}
            Save changes
          </button>
          {saved && <p role="status" className="text-xs text-emerald-700">Profile saved.</p>}
          {save.error && <p role="alert" className="text-xs text-rose-700">{save.error.message}</p>}
        </div>
      </form>
    </div>
  );
}
