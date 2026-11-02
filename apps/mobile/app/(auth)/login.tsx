import { router } from "expo-router";
import { Button } from "@/components/Button";
import { FormField } from "@/components/FormField";
import { SkeletonHero } from "@/components/Skeleton";
import { useSchoolLoginForm } from "@/features/auth/forms";
import { loginSchool } from "@/features/auth/actions";
import { useSchoolBranding } from "@/features/auth/school";
import {
  AuthText as Text,
  AuthPage,
  useAuthFeedback,
} from "@/features/auth/ui";
export default function LoginScreen() {
  const feedback = useAuthFeedback();
  const school = useSchoolBranding();
  const form = useSchoolLoginForm(async (value) => {
    await feedback.run(() => loginSchool(value.login, value.password));
  });
  return (
    <AuthPage
      title="Welcome back"
      detail={school.data?.name ?? "Sign in to your school account."}
      message={feedback.message}
    >
      {school.isPending ? (
        <SkeletonHero />
      ) : school.isError ? (
        <>
          <Text>
            We couldn’t confirm this school. Check your connection or change the
            school code.
          </Text>
          <Button
            label="Retry school lookup"
            variant="secondary"
            onPress={() => void school.refetch()}
          />
        </>
      ) : (
        <>
          <form.Field name="login">
            {(field) => (
              <FormField
                label="Username or email"
                field={field}
                autoComplete="username"
              />
            )}
          </form.Field>
          <form.Field name="password">
            {(field) => (
              <FormField
                label="Password"
                field={field}
                secret
                autoComplete="current-password"
              />
            )}
          </form.Field>
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(busy) => (
              <Button
                label={
                  feedback.cooldown
                    ? `Try again in ${feedback.cooldown}s`
                    : "Sign in"
                }
                loading={busy}
                disabled={!!feedback.cooldown}
                onPress={() => void form.handleSubmit()}
              />
            )}
          </form.Subscribe>
        </>
      )}
      <Button
        label="Forgot password?"
        variant="ghost"
        onPress={() => router.push("/(auth)/forgot-password")}
      />
      <Button
        label="Change school"
        variant="secondary"
        onPress={() => router.replace("/(auth)/school")}
      />
    </AuthPage>
  );
}
