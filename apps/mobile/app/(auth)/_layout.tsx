import { Stack } from "expo-router";
import { useSession } from "@/lib/session";
import { useTheme } from "@/theme/theme";
export default function AuthLayout() {
  const { status, subdomain } = useSession();
  const { reduceMotion } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: reduceMotion ? "none" : "fade",
      }}
    >
      <Stack.Protected guard={status === "signedOut" && !!subdomain}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={status === "signedOut"}>
        <Stack.Screen name="school" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="reset-password" />
      </Stack.Protected>
      <Stack.Protected guard={status === "loading"}>
        <Stack.Screen name="loading" />
      </Stack.Protected>
      <Stack.Protected guard={status === "needsTwoFactor"}>
        <Stack.Screen name="two-factor" />
      </Stack.Protected>
      <Stack.Protected guard={status === "needsPasswordChange"}>
        <Stack.Screen name="change-password" />
      </Stack.Protected>
      <Stack.Protected guard={status === "needsTwoFactorSetup"}>
        <Stack.Screen name="two-factor-setup" />
      </Stack.Protected>
      <Stack.Protected guard={status === "subscriptionInactive"}>
        <Stack.Screen name="subscription-inactive" />
      </Stack.Protected>
      <Stack.Protected guard={status === "needsRoleSelection"}>
        <Stack.Screen name="role-selection" />
      </Stack.Protected>
    </Stack>
  );
}
