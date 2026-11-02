import { router } from "expo-router";
import { GraduationCap } from "lucide-react-native";
import { Text, View } from "react-native";
import { Button } from "@/components/Button";
import { GlassCard } from "@/components/GlassCard";
import { Screen } from "@/components/Screen";
import { spacing, type, useTheme } from "@/theme/theme";

// The school-code and school-account sign-in flow arrives in Phase 3.
// Do not collect credentials or expose a platform-administration fallback.
export default function SchoolAccessScreen() {
  const { colors } = useTheme();
  return (
    <Screen title="SchoolHub" subtitle="Your school, connected">
      <GlassCard padding={spacing.xxl}>
        <View style={{ gap: spacing.lg }}>
          <GraduationCap
            size={44}
            color={colors.primary}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
          <Text style={[type.title, { color: colors.foreground }]}>
            School access is coming soon
          </Text>
          <Text style={[type.body, { color: colors.mutedForeground }]}>
            Please continue using your school’s web portal while mobile access
            is being prepared.
          </Text>
          {__DEV__ ? (
            <Button
              label="Open design gallery"
              variant="secondary"
              onPress={() => router.push("/dev-gallery")}
            />
          ) : null}
        </View>
      </GlassCard>
    </Screen>
  );
}
