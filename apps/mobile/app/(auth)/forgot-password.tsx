import { useState } from "react";
import { router, type Href } from "expo-router";
import { Pressable, View } from "react-native";
import { completePasswordRecovery, requestPasswordRecovery } from "@/api/auth";
import { Button } from "@/components/Button";
import { Card } from "@/components/Surface";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Typography";
import { TextField } from "@/components/TextField";
import {
  authFailureMessage,
  passwordRecoveryFormSchema,
  passwordResetFormSchema,
} from "@/features/auth/forms";
import { useSession } from "@/lib/session";
import { spacing, type, useTheme } from "@/theme/theme";

export default function ForgotPasswordScreen() {
  const { subdomain } = useSession();
  const { colors } = useTheme();
  const [mode, setMode] = useState<"request" | "complete">("request");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function requestReset() {
    const parsed = passwordRecoveryFormSchema.safeParse({ email });
    if (!parsed.success) {
      setError(
        parsed.error.issues[0]?.message ?? "Enter a valid email address.",
      );
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const result = await requestPasswordRecovery({
        request: {
          ...parsed.data,
          ...(subdomain ? { school: subdomain } : {}),
        },
      });
      setNotice(result.message);
    } catch (failure) {
      setError(authFailureMessage(failure, "recovery"));
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    const parsed = passwordResetFormSchema.safeParse({
      token,
      newPassword,
      confirmPassword,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the reset details.");
      return;
    }
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await completePasswordRecovery({
        request: {
          token: parsed.data.token,
          newPassword: parsed.data.newPassword,
        },
      });
      setToken("");
      setNewPassword("");
      setConfirmPassword("");
      setMode("request");
      setNotice(
        "Your password has been reset. Sign in with your new password.",
      );
    } catch (failure) {
      setError(authFailureMessage(failure, "recoveryComplete"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen
      title={mode === "request" ? "Reset your password" : "Set a new password"}
      subtitle="Your account details are kept private"
    >
      <Card padding={spacing.xl}>
        <View style={{ gap: spacing.lg }}>
          {mode === "request" ? (
            <>
              <Text style={[type.body, { color: colors.mutedForeground }]}>
                Enter the email address on your school account. If it is
                eligible, you will receive a reset link.
              </Text>
              <TextField
                label="Email address"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoCapitalize="none"
                editable={!loading}
              />
              <Button
                label="Send reset link"
                onPress={() => void requestReset()}
                loading={loading}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setMode("complete");
                  setError("");
                  setNotice("");
                }}
                style={{
                  minHeight: 44,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={[type.bodyStrong, { color: colors.primary }]}>
                  I have a reset token
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <TextField
                label="Reset token"
                value={token}
                onChangeText={setToken}
                autoCapitalize="none"
                editable={!loading}
              />
              <TextField
                label="New password"
                value={newPassword}
                onChangeText={setNewPassword}
                secret
                textContentType="newPassword"
                editable={!loading}
              />
              <TextField
                label="Confirm new password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secret
                textContentType="newPassword"
                editable={!loading}
              />
              <Button
                label="Reset password"
                onPress={() => void resetPassword()}
                loading={loading}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setMode("request");
                  setError("");
                  setNotice("");
                }}
                style={{
                  minHeight: 44,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={[type.bodyStrong, { color: colors.primary }]}>
                  Request another reset link
                </Text>
              </Pressable>
            </>
          )}
          {error ? (
            <Text
              accessibilityRole="alert"
              style={[type.caption, { color: colors.destructive }]}
            >
              {error}
            </Text>
          ) : null}
          {notice ? (
            <Text
              accessibilityRole="alert"
              style={[type.body, { color: colors.success }]}
            >
              {notice}
            </Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace("/(auth)/login" as Href)}
            style={{
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={[type.body, { color: colors.mutedForeground }]}>
              Back to sign in
            </Text>
          </Pressable>
        </View>
      </Card>
    </Screen>
  );
}
