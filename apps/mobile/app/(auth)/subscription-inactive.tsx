import { useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Surface";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Typography";
import { authFailureMessage } from "@/features/auth/forms";
import { retrySession } from "@/lib/restore-session";
import { signOut } from "@/lib/auth-actions";
import { sessionStore } from "@/lib/session";
import { spacing, type, useTheme } from "@/theme/theme";

export default function SubscriptionInactiveScreen() {
  const { colors } = useTheme();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function retry() {
    setLoading(true);
    setError("");
    try {
      await retrySession();
      if (sessionStore.getSnapshot().status === "subscriptionInactive") {
        setError(
          "School access is still paused. Contact your school administrator.",
        );
      } else {
        router.replace("/");
      }
    } catch (failure) {
      setError(authFailureMessage(failure, "session"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen title="School access is paused">
      <Card padding={spacing.xl}>
        <View style={{ gap: spacing.lg }}>
          <Text style={[type.body, { color: colors.mutedForeground }]}>
            Contact your school administrator for help restoring access.
          </Text>
          {error ? (
            <Text
              accessibilityRole="alert"
              style={[type.caption, { color: colors.destructive }]}
            >
              {error}
            </Text>
          ) : null}
          <Button
            label="Try again"
            onPress={() => void retry()}
            loading={loading}
          />
          <Button
            label="Sign out"
            variant="secondary"
            onPress={() => {
              void signOut().then(
                () => router.replace("/"),
                () => {
                  setError(
                    "Your local session was cleared, but server sign-out could not be confirmed.",
                  );
                  router.replace("/");
                },
              );
            }}
          />
        </View>
      </Card>
    </Screen>
  );
}
