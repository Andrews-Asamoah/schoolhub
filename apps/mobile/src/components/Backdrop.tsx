import { LinearGradient } from "expo-linear-gradient";
import { StyleSheet, View } from "react-native";
import { mix, useTheme, withAlpha } from "@/theme/theme";

/**
 * Atmospheric background that glass sits on. Tinted by the school's colours
 * when a tenant is set, otherwise by the platform primary.
 */
export function Backdrop() {
  const { colors, accent, accentSecondary, isDark } = useTheme();
  const top = mix(colors.background, accent, isDark ? 0.06 : 0.025);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient
        colors={[
          top,
          colors.background,
          mix(colors.background, accentSecondary, isDark ? 0.04 : 0.02),
        ]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[
          withAlpha(accent, isDark ? 0.06 : 0.025),
          withAlpha(accent, 0),
        ]}
        start={{ x: 0.2, y: 0.1 }}
        end={{ x: 0.8, y: 0.9 }}
        style={[
          styles.orb,
          { top: -120, right: -100, width: 320, height: 320 },
        ]}
      />
      <LinearGradient
        colors={[
          withAlpha(accentSecondary, isDark ? 0.04 : 0.02),
          withAlpha(accentSecondary, 0),
        ]}
        start={{ x: 0.2, y: 0.1 }}
        end={{ x: 0.8, y: 0.9 }}
        style={[
          styles.orb,
          { bottom: 80, left: -140, width: 360, height: 360 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  orb: { position: "absolute", borderRadius: 999 },
});
