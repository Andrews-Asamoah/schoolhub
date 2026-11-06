import { Stack } from "expo-router";
import { useSession } from "@/lib/session";

export default function AuthLayout() {
  const { status } = useSession();
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={status === "signedOut"}>
        <Stack.Screen name="school" />
        <Stack.Screen name="login" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
      <Stack.Protected guard={status === "needsRoleSelection"}>
        <Stack.Screen name="role" />
      </Stack.Protected>
      <Stack.Protected guard={status === "needsPasswordChange"}>
        <Stack.Screen name="change-password" />
      </Stack.Protected>
      <Stack.Protected guard={status === "subscriptionInactive"}>
        <Stack.Screen name="subscription-inactive" />
      </Stack.Protected>
      <Stack.Protected guard={status === "needsTwoFactorSetup"}>
        <Stack.Screen name="two-factor-setup" />
      </Stack.Protected>
    </Stack>
  );
}
