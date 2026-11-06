import { useState } from "react";
import { router } from "expo-router";
import { Pressable, View } from "react-native";
import { Card } from "@/components/Surface";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Typography";
import { ROLE_LABELS } from "@/lib/permissions";
import { setActiveRole, useSession } from "@/lib/session";
import { spacing, type, useTheme } from "@/theme/theme";

export default function RoleSelectionScreen() {
  const { colors } = useTheme();
  const session = useSession();
  const [error, setError] = useState("");

  return (
    <Screen title="Choose your role" subtitle="Select how you use SchoolHub">
      <View style={{ gap: spacing.md }}>
        {session.roles.map((role) => (
          <Pressable
            key={role}
            accessibilityRole="button"
            accessibilityLabel={`Continue as ${ROLE_LABELS[role]}`}
            onPress={() => {
              setError("");
              void setActiveRole(role).then(
                () => router.replace("/"),
                () => setError("We couldn't save that role. Please try again."),
              );
            }}
          >
            <Card padding={spacing.xl}>
              <Text style={[type.title, { color: colors.foreground }]}>
                {ROLE_LABELS[role]}
              </Text>
            </Card>
          </Pressable>
        ))}
        {error ? (
          <Text
            accessibilityRole="alert"
            style={[type.caption, { color: colors.destructive }]}
          >
            {error}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
