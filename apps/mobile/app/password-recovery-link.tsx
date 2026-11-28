import { router, useNavigation } from "expo-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { View } from "react-native";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Surface";
import { Text } from "@/components/Typography";
import PasswordRecoveryScreen from "@/features/auth/PasswordRecoveryScreen";
import {
  clearRecoveryLink,
  getRecoveryLink,
  subscribeToRecoveryLink,
} from "@/features/auth/recovery-link";
import { useSession } from "@/lib/session";
import { signOut } from "@/lib/sign-out";
import { spacing } from "@/theme/theme";

export default function PasswordRecoveryLinkScreen() {
  const { status } = useSession();
  const navigation = useNavigation();
  const link = useSyncExternalStore(subscribeToRecoveryLink, getRecoveryLink);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);

  useEffect(
    () => navigation.addListener("blur", clearRecoveryLink),
    [navigation],
  );

  function exit() {
    clearRecoveryLink();
    if (status === "signedOut") router.replace("/(auth)/login");
    else router.replace("/");
  }

  async function signOutAndContinue() {
    setSigningOut(true);
    setError("");
    try {
      await signOut();
    } catch {
      setError("Sign-out could not be confirmed. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  if (link && status === "signedOut" && !signingOut && !error) {
    return (
      <PasswordRecoveryScreen
        key={link.id}
        linkedToken={link.token}
        onExit={exit}
        onComplete={() => {
          if (getRecoveryLink()?.id === link.id) {
            setCompleted(true);
            clearRecoveryLink();
          }
        }}
      />
    );
  }

  return (
    <Screen title="Reset your password">
      <Card padding={spacing.xl}>
        <View style={{ gap: spacing.md }}>
          {link ? (
            <>
              {status === "signedOut" ? null : (
                <Text>
                  Sign out of your current schoolHub session to use the password
                  reset link.
                </Text>
              )}
              <Button
                label={
                  status === "signedOut"
                    ? "Continue with reset"
                    : "Sign out and continue"
                }
                onPress={() => {
                  if (status === "signedOut") setError("");
                  else void signOutAndContinue();
                }}
                loading={signingOut}
              />
              {error ? <Text accessibilityRole="alert">{error}</Text> : null}
            </>
          ) : completed ? (
            <Text accessibilityRole="alert">
              Your password has been reset. Sign in with your new password.
            </Text>
          ) : (
            <Text accessibilityRole="alert">
              This reset link is no longer open. Reopen the email or request
              another link from sign in.
            </Text>
          )}
          <Button
            label={
              status === "signedOut" ? "Back to sign in" : "Back to schoolHub"
            }
            variant="secondary"
            onPress={exit}
            disabled={signingOut}
          />
        </View>
      </Card>
    </Screen>
  );
}
