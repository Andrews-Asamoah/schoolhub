import { useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Surface";
import { FormField } from "@/components/FormField";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Typography";
import {
  authFailureMessage,
  useChangePasswordForm,
} from "@/features/auth/forms";
import { changePasswordForCurrentSession } from "@/features/auth/auth-actions";
import { spacing, type, useTheme } from "@/theme/theme";
import { signOut } from "@/lib/auth-actions";

export default function ChangePasswordScreen() {
  const { colors } = useTheme();
  const [error, setError] = useState("");
  const form = useChangePasswordForm(async (value) => {
    setError("");
    try {
      await changePasswordForCurrentSession(value);
      router.replace("/");
    } catch (failure) {
      setError(authFailureMessage(failure, "password"));
    }
  });

  return (
    <Screen
      title="Change your password"
      subtitle="Choose a new password to continue"
    >
      <Card padding={spacing.xl}>
        <View style={{ gap: spacing.lg }}>
          <Text style={[type.body, { color: colors.mutedForeground }]}>
            Use at least 10 characters, including an uppercase letter, a
            lowercase letter and a number.
          </Text>
          <form.Field name="currentPassword">
            {(field) => (
              <FormField
                field={field}
                label="Current password"
                secret
                textContentType="password"
              />
            )}
          </form.Field>
          <form.Field name="newPassword">
            {(field) => (
              <FormField
                field={field}
                label="New password"
                secret
                textContentType="newPassword"
              />
            )}
          </form.Field>
          <form.Field name="confirmPassword">
            {(field) => (
              <FormField
                field={field}
                label="Confirm new password"
                secret
                textContentType="newPassword"
                onSubmitEditing={() => void form.handleSubmit()}
              />
            )}
          </form.Field>
          {error ? (
            <Text
              accessibilityRole="alert"
              style={[type.caption, { color: colors.destructive }]}
            >
              {error}
            </Text>
          ) : null}
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button
                label="Save new password"
                onPress={() => void form.handleSubmit()}
                loading={isSubmitting}
              />
            )}
          </form.Subscribe>
          <Button
            label="Sign out"
            variant="secondary"
            onPress={() => {
              void signOut().then(
                () => router.replace("/"),
                () =>
                  setError(
                    "Your local session was cleared, but server sign-out could not be confirmed.",
                  ),
              );
            }}
          />
        </View>
      </Card>
    </Screen>
  );
}
