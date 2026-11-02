import { View } from "react-native";
import { Button } from "@/components/Button";
import { ROLE_LABELS } from "@/lib/permissions";
import { sessionStore, useSession } from "@/lib/session";
import { useAuthFeedback, AuthText } from "./ui";
export function RoleChoices() {
  const { roles, activeRole } = useSession();
  const feedback = useAuthFeedback();
  return (
    <View style={{ gap: 12 }}>
      {feedback.message ? (
        <AuthText accessibilityRole="alert">{feedback.message}</AuthText>
      ) : null}
      {roles.map((role) => (
        <Button
          key={role}
          label={`${ROLE_LABELS[role]}${activeRole === role ? " (current)" : ""}`}
          onPress={() => void feedback.run(() => sessionStore.selectRole(role))}
        />
      ))}
    </View>
  );
}
