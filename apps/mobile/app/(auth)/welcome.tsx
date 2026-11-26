import { LinearGradient } from "expo-linear-gradient";
import { Redirect, router } from "expo-router";
import { CircleHelp } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import { Button } from "@/components/Button";
import { PlatformLogo } from "@/components/PlatformLogo";
import { Screen } from "@/components/Screen";
import { Surface } from "@/components/Surface";
import { Text } from "@/components/Typography";
import { useSession } from "@/lib/session";
import { radius, spacing, type, useTheme } from "@/theme/theme";

export default function WelcomeScreen() {
  const { subdomain } = useSession();
  const { colors } = useTheme();

  if (subdomain) return <Redirect href="/(auth)/login" />;

  return (
    <Screen contentStyle={styles.viewport}>
      <View style={styles.page}>
        <LinearGradient
          colors={["#061D49", "#12479B"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.artwork}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View style={[styles.ring, styles.goldRing]} pointerEvents="none" />
          <View style={[styles.ring, styles.lightRing]} pointerEvents="none" />
          <View>
            <PlatformLogo />
          </View>
        </LinearGradient>

        <View style={styles.intro}>
          <Text
            accessibilityRole="header"
            style={[type.display, { color: colors.foreground }]}
          >
            Welcome to CampusHubGH
          </Text>
          <Text style={[type.body, { color: colors.mutedForeground }]}>
            Find your school, then sign in with the account your school gave
            you.
          </Text>
        </View>

        <Button
          label="Find my school"
          onPress={() => router.replace("/(auth)/school")}
        />

        <Surface padding={spacing.lg} style={styles.help}>
          <CircleHelp size={20} color={colors.primary} accessible={false} />
          <View style={styles.helpCopy}>
            <Text style={[type.bodyStrong, { color: colors.foreground }]}>
              Need your school code?
            </Text>
            <Text style={[type.caption, { color: colors.mutedForeground }]}>
              Your school office can give you a code or address prefix.
            </Text>
          </View>
        </Surface>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  viewport: { flexGrow: 1, justifyContent: "center" },
  page: { width: "100%", maxWidth: 440, alignSelf: "center", gap: spacing.xxl },
  artwork: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xxl,
    borderRadius: radius.xl,
    overflow: "hidden",
  },
  ring: {
    position: "absolute",
    borderWidth: 1,
    borderRadius: radius.pill,
  },
  goldRing: {
    top: -98,
    right: -90,
    width: 248,
    height: 248,
    borderColor: "rgba(255, 194, 74, 0.5)",
  },
  lightRing: {
    bottom: -126,
    left: -78,
    width: 260,
    height: 260,
    borderColor: "rgba(255, 255, 255, 0.26)",
  },
  intro: { gap: spacing.sm },
  help: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  helpCopy: { flex: 1, gap: spacing.xs },
});
