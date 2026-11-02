import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";
import { passwordFormSchema } from "@/features/auth/schemas";
import { replacePassword } from "@/features/auth/actions";
import { AuthPage, AuthExit, useAuthFeedback } from "@/features/auth/ui";
export default function ChangePasswordScreen() {
  const feedback = useAuthFeedback();
  const form = useForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    validators: { onSubmit: passwordFormSchema },
    onSubmit: async ({ value }) => {
      await feedback.run(() =>
        replacePassword(value.currentPassword, value.newPassword),
      );
    },
  });
  return (
    <AuthPage
      title="Choose a new password"
      detail="Replace your temporary password before accessing your school."
      message={feedback.message}
    >
      {(["currentPassword", "newPassword", "confirmPassword"] as const).map(
        (name) => (
          <form.Field key={name} name={name}>
            {(field) => (
              <FormField
                label={
                  name === "currentPassword"
                    ? "Current password"
                    : name === "newPassword"
                      ? "New password"
                      : "Confirm new password"
                }
                field={field}
                secret
                autoComplete={
                  name === "currentPassword"
                    ? "current-password"
                    : "new-password"
                }
              />
            )}
          </form.Field>
        ),
      )}
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(busy) => (
          <Button
            label="Save new password"
            loading={busy}
            disabled={!!feedback.cooldown}
            onPress={() => void form.handleSubmit()}
          />
        )}
      </form.Subscribe>
      <AuthExit />
    </AuthPage>
  );
}
