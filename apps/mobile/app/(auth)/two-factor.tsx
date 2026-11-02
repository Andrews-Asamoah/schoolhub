import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";
import { verifySchema } from "@/features/auth/schemas";
import { verifySecondFactor } from "@/features/auth/actions";
import { AuthPage, AuthExit, useAuthFeedback } from "@/features/auth/ui";
export default function TwoFactorScreen() {
  const [backup, setBackup] = useState(false);
  const feedback = useAuthFeedback();
  const form = useForm({
    defaultValues: { code: "" },
    validators: { onSubmit: verifySchema },
    onSubmit: async ({ value }) => {
      await feedback.run(() => verifySecondFactor(value.code.trim(), backup));
    },
  });
  return (
    <AuthPage
      title="Verify it’s you"
      detail={
        backup
          ? "Enter one of your unused backup codes."
          : "Enter the six-digit code from your authenticator. This sign-in attempt expires after five minutes."
      }
      message={feedback.message}
    >
      <form.Field name="code">
        {(field) => (
          <FormField
            label={backup ? "Backup code" : "Authenticator code"}
            field={field}
            keyboardType={backup ? "default" : "number-pad"}
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            secret={backup}
          />
        )}
      </form.Field>
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(busy) => (
          <Button
            label="Verify code"
            loading={busy}
            disabled={!!feedback.cooldown}
            onPress={() => void form.handleSubmit()}
          />
        )}
      </form.Subscribe>
      <Button
        label={backup ? "Use authenticator code" : "Use a backup code"}
        variant="ghost"
        onPress={() => {
          form.reset();
          setBackup((v) => !v);
        }}
      />
      <AuthExit />
    </AuthPage>
  );
}
