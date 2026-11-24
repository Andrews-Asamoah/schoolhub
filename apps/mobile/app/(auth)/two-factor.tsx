import { Redirect, router, type Href } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { Button } from "@/components/Button";
import { OtpInput } from "@/components/Fields";
import { Screen } from "@/components/Screen";
import { Card } from "@/components/Surface";
import { TextField } from "@/components/TextField";
import { Text } from "@/components/Typography";
import {
  MobileTwoFactorExpiredError,
  UnsupportedMobileRoleError,
  verifyMobileTwoFactor,
} from "@/features/auth/auth-actions";
import { authFailureMessage } from "@/features/auth/forms";
import {
  clearTwoFactorChallenge,
  hasTwoFactorChallenge,
} from "@/lib/auth-client";
import { useSession } from "@/lib/session";
import { spacing } from "@/theme/theme";

export default function VerificationStep() {
  const [hadChallenge] = useState(hasTwoFactorChallenge);
  const { subdomain } = useSession();
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const foreground = AppState.addEventListener("change", (state) => {
      if (state === "active") hasTwoFactorChallenge();
    });
    return () => {
      foreground.remove();
      mounted.current = false;
      // React development builds may immediately remount effects.
      queueMicrotask(() => {
        if (!mounted.current) clearTwoFactorChallenge();
      });
    };
  }, []);
  const [backup, setBackup] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [expired, setExpired] = useState(false);
  const valid = backup ? code.trim().length > 0 : /^\d{6}$/.test(code);

  async function verify() {
    if (!subdomain || !valid || busy || expired) return;
    setBusy(true);
    setError("");
    try {
      await verifyMobileTwoFactor(subdomain, code.trim(), backup);
      router.replace("/");
    } catch (failure) {
      if (failure instanceof MobileTwoFactorExpiredError) {
        setExpired(true);
        setError(failure.message);
      } else {
        setError(
          failure instanceof UnsupportedMobileRoleError
            ? failure.message
            : authFailureMessage(failure, "twoFactor"),
        );
      }
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  if (!subdomain || !hadChallenge)
    return <Redirect href={"/(auth)/login" as Href} />;

  return (
    <Screen
      title="Verify your sign-in"
      subtitle={
        backup
          ? "Use one of your saved backup codes."
          : "Enter the code from your authenticator app."
      }
    >
      <Card padding={spacing.xl}>
        <View style={{ gap: spacing.lg }}>
          {backup ? (
            <TextField
              label="Backup code"
              value={code}
              onChangeText={setCode}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy && !expired}
              secureTextEntry
              maxLength={32}
            />
          ) : (
            <OtpInput
              value={code}
              onChange={setCode}
              disabled={busy || expired}
            />
          )}
          {error ? <Text accessibilityRole="alert">{error}</Text> : null}
          <Button
            label="Verify"
            loading={busy}
            disabled={!valid || expired}
            onPress={() => void verify()}
          />
          <Button
            label={backup ? "Use authenticator code" : "Use a backup code"}
            variant="secondary"
            disabled={busy || expired}
            onPress={() => {
              setBackup(!backup);
              setCode("");
              setError("");
            }}
          />
          <Button
            label="Back to sign in"
            variant="ghost"
            disabled={busy}
            onPress={() => {
              clearTwoFactorChallenge();
              if (router.canGoBack()) router.back();
              else router.replace("/(auth)/login" as Href);
            }}
          />
        </View>
      </Card>
    </Screen>
  );
}
