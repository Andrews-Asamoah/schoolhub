import { useState } from "react";
import { router } from "expo-router";
import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";
import { recoverySchema } from "@/features/auth/schemas";
import { recoverPassword } from "@/features/auth/actions";
import {
  AuthText as Text,
  AuthPage,
  useAuthFeedback,
} from "@/features/auth/ui";
export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const feedback = useAuthFeedback();
  const form = useForm({
    defaultValues: { email: "" },
    validators: { onSubmit: recoverySchema },
    onSubmit: async ({ value }) => {
      if (
        await feedback.run(() =>
          recoverPassword(value.email.trim().toLowerCase()),
        )
      ) {
        setSent(true);
        form.reset();
      }
    },
  });
  return (
    <AuthPage
      title="Reset your password"
      detail="Enter the email used for your school account."
      message={feedback.message}
    >
      {sent ? (
        <Text accessibilityLiveRegion="polite">
          If this address belongs to an eligible account, a reset link will
          arrive shortly. Otherwise, contact your school administrator.
        </Text>
      ) : null}
      <form.Field name="email">
        {(field) => (
          <FormField
            label="School account email"
            field={field}
            keyboardType="email-address"
            autoComplete="email"
          />
        )}
      </form.Field>
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(busy) => (
          <Button
            label="Send reset link"
            loading={busy}
            disabled={!!feedback.cooldown}
            onPress={() => void form.handleSubmit()}
          />
        )}
      </form.Subscribe>
      <Button
        label="I have a reset token"
        variant="secondary"
        onPress={() => router.push("/(auth)/reset-password")}
      />
      <Button
        label="Back to sign in"
        variant="ghost"
        onPress={() => router.replace("/(auth)/login")}
      />
    </AuthPage>
  );
}
