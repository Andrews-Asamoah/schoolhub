import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";
import {
  useEnrollment,
  enableSecondFactor,
  confirmEnrollment,
} from "@/features/auth/actions";
import { setupSchema, verifySchema } from "@/features/auth/schemas";
import {
  AuthText as Text,
  AuthPage,
  AuthExit,
  useAuthFeedback,
} from "@/features/auth/ui";
export default function TwoFactorSetup() {
  const enrollment = useEnrollment();
  const feedback = useAuthFeedback();
  const setup = useForm({
    defaultValues: { password: "" },
    validators: { onSubmit: setupSchema },
    onSubmit: async ({ value }) => {
      if (await feedback.run(() => enableSecondFactor(value.password)))
        setup.reset();
    },
  });
  const confirm = useForm({
    defaultValues: { code: "" },
    validators: { onSubmit: verifySchema },
    onSubmit: async ({ value }) => {
      await feedback.run(() => confirmEnrollment(value.code.trim()));
    },
  });
  return (
    <AuthPage
      title="Set up verification"
      detail="Your account requires an authenticator before school access is allowed."
      message={feedback.message}
    >
      {enrollment ? (
        <>
          <Text>
            Add SchoolHub to your authenticator using this setup key. Keep it
            private.
          </Text>
          <Text
            selectable
            accessibilityLabel={`Authenticator setup key: ${enrollment.secret}`}
          >
            {enrollment.secret}
          </Text>
          <Text>
            Save these backup codes somewhere private. Each code works once.
          </Text>
          {enrollment.backupCodes.map((code, i) => (
            <Text key={i} selectable>
              {code}
            </Text>
          ))}
          <confirm.Field name="code">
            {(field) => (
              <FormField
                label="Authenticator code"
                field={field}
                keyboardType="number-pad"
                autoComplete="one-time-code"
              />
            )}
          </confirm.Field>
          <confirm.Subscribe selector={(s) => s.isSubmitting}>
            {(busy) => (
              <Button
                label="Confirm authenticator"
                loading={busy}
                disabled={!!feedback.cooldown}
                onPress={() => void confirm.handleSubmit()}
              />
            )}
          </confirm.Subscribe>
        </>
      ) : (
        <>
          <setup.Field name="password">
            {(field) => (
              <FormField
                label="Current password"
                field={field}
                secret
                autoComplete="current-password"
              />
            )}
          </setup.Field>
          <setup.Subscribe selector={(s) => s.isSubmitting}>
            {(busy) => (
              <Button
                label="Create authenticator setup"
                loading={busy}
                disabled={!!feedback.cooldown}
                onPress={() => void setup.handleSubmit()}
              />
            )}
          </setup.Subscribe>
        </>
      )}
      <AuthExit />
    </AuthPage>
  );
}
