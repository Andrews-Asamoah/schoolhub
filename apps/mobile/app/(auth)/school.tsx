import { useForm } from "@tanstack/react-form";
import { router } from "expo-router";
import { SessionChangedError } from "@/lib/api-error";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";
import { queryClient } from "@/lib/query-client";
import { sessionStore, useSession } from "@/lib/session";
import { schoolFormSchema } from "@/features/auth/schemas";
import { schoolQuery } from "@/features/auth/school";
import { AuthPage, useAuthFeedback } from "@/features/auth/ui";
export default function SchoolScreen() {
  const feedback = useAuthFeedback();
  const session = useSession();
  const form = useForm({
    defaultValues: { code: session.subdomain ?? "" },
    validators: { onSubmit: schoolFormSchema },
    onSubmit: async ({ value }) => {
      await feedback.run(async () => {
        const { code } = schoolFormSchema.parse(value);
        const revision = sessionStore.getRevision();
        const school = await queryClient.fetchQuery(schoolQuery(code));
        if (sessionStore.getRevision() !== revision)
          throw new SessionChangedError();
        if (school.subdomain !== code)
          throw new Error("School context mismatch");
        const saving = sessionStore.setSubdomain(code);
        const owner = sessionStore.getRevision();
        await saving;
        if (owner !== sessionStore.getRevision())
          throw new SessionChangedError();
        router.push("/(auth)/login");
      });
    },
  });
  return (
    <AuthPage
      title="Your school"
      detail="Enter the school code provided by your school to continue."
      message={feedback.message}
    >
      <form.Field name="code">
        {(field) => (
          <FormField label="School code" field={field} autoComplete="off" />
        )}
      </form.Field>
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(busy) => (
          <Button
            label="Find my school"
            loading={busy}
            disabled={!!feedback.cooldown}
            onPress={() => void form.handleSubmit()}
          />
        )}
      </form.Subscribe>
      {__DEV__ ? (
        <Button
          label="Open design gallery"
          variant="ghost"
          onPress={() => router.push("/dev-gallery")}
        />
      ) : null}
    </AuthPage>
  );
}
