import { router, type Href } from "expo-router";
import { ShieldCheck } from "lucide-react-native";
import { View } from "react-native";
import { Button } from "@/components/Button";
import { Card } from "@/components/Surface";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Typography";
import { spacing, type, useTheme } from "@/theme/theme";

export default function SecurityScreen() {
  const { colors } = useTheme();
  return (
    <Screen title="Security" subtitle="Protect your school account">
      <View style={{ gap: spacing.lg }}>
        <Card padding={spacing.xl}>
          <View style={{ gap: spacing.md }}>
            <ShieldCheck size={28} color={colors.primary} />
            <Text style={[type.body, { color: colors.foreground }]}>
              Your sign-in session is stored securely on this device. Update
              your password regularly and sign out on shared devices.
            </Text>
            <Text style={[type.caption, { color: colors.mutedForeground }]}>
              Two-factor sign-in and trusted-device management are not available
              in mobile yet. Use your school&apos;s web portal for those
              settings.
            </Text>
          </View>
        </Card>
        <Button
          label="Change password"
          onPress={() =>
            router.push("/(shared)/security/change-password" as Href)
          }
        />
      </View>
    </Screen>
  );
}
