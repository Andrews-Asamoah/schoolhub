import { useState } from "react";
import { router } from "expo-router";
import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Typography";
import { retrySession } from "@/lib/restore-session";
import { signOut } from "@/lib/sign-out";

export default function RestoreUnavailableScreen() {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function retry() {
    setBusy(true);
    setFailed(false);
    try {
      await retrySession();
      router.replace("/");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Reconnect to schoolHub">
      <Text>
        Connect to the internet so schoolHub can verify your saved session.
      </Text>
      {failed ? (
        <Text accessibilityRole="alert">schoolHub is still unreachable.</Text>
      ) : null}
      <Button label="Try again" loading={busy} onPress={() => void retry()} />
      <Button
        label="Sign out and clear offline changes"
        variant="secondary"
        disabled={busy}
        onPress={() =>
          void signOut()
            .catch(() => undefined)
            .finally(() => router.replace("/"))
        }
      />
    </Screen>
  );
}
