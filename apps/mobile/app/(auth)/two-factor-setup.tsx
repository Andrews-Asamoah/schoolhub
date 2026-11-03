import { useState } from "react";
import { router } from "expo-router";
import { View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Surface";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Typography";
import { signOut } from "@/lib/auth-actions";
import { spacing, type, useTheme } from "@/theme/theme";

export default function TwoFactorSetupScreen() {
  const { colors } = useTheme();
  const [error, setError] = useState("");
  return (
    <Screen title="Additional verification required">
      <Card padding={spacing.xl}>
        <View style={{ gap: spacing.lg }}>
          <Text style={[type.body, { color: colors.mutedForeground }]}>
            Two-factor setup for this account must be completed through your
            school web portal. Sign out and contact your school administrator if
            you need help.
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
            label="Sign out"
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
