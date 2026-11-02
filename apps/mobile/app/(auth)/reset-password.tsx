import { useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import { router, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";
import { resetFormSchema } from "@/features/auth/schemas";
import { resetPassword } from "@/features/auth/actions";
import { AuthPage, useAuthFeedback } from "@/features/auth/ui";
const KEY = "schoolhub.password-reset-token";
export default function ResetPassword() {
  const params = useLocalSearchParams<{ token?: string }>();
  const feedback = useAuthFeedback();
  const form = useForm({
    defaultValues: { token: "", newPassword: "", confirmPassword: "" },
    validators: { onSubmit: resetFormSchema },
    onSubmit: async ({ value }) => {
      const input = resetFormSchema.parse(value);
      if (
        await feedback.run(() => resetPassword(input.token, input.newPassword))
      ) {
        form.reset();
        await SecureStore.deleteItemAsync(KEY);
        router.replace("/(auth)/login");
      }
    },
  });
  useEffect(() => {
    let active = true;
    const token = params.token;
    if (
      typeof token === "string" &&
      token.length >= 20 &&
      token.length <= 128
    ) {
      void SecureStore.setItemAsync(KEY, token)
        .then(() => {
          if (active) {
            form.setFieldValue("token", token);
            router.setParams({ token: undefined });
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
      void SecureStore.deleteItemAsync(KEY).catch(() => {});
    };
  }, [params.token, form]);
  return (
    <AuthPage
      title="New password"
      detail="Open your reset email link or enter its reset token below."
      message={feedback.message}
    >
      <form.Field name="token">
        {(field) => (
          <FormField
            label="Reset token or email link"
            field={field}
            secret
            autoComplete="off"
          />
        )}
      </form.Field>
      <form.Field name="newPassword">
        {(field) => (
          <FormField
            label="New password"
            field={field}
            secret
            autoComplete="new-password"
          />
        )}
      </form.Field>
      <form.Field name="confirmPassword">
        {(field) => (
          <FormField
            label="Confirm new password"
            field={field}
            secret
            autoComplete="new-password"
          />
        )}
      </form.Field>
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(busy) => (
          <Button
            label="Reset password"
            loading={busy}
            disabled={!!feedback.cooldown}
            onPress={() => void form.handleSubmit()}
          />
        )}
      </form.Subscribe>
      <Button
        label="Back to sign in"
        variant="ghost"
        onPress={() => router.replace("/(auth)/login")}
      />
    </AuthPage>
  );
}
