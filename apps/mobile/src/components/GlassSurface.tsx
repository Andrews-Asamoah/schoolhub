import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { radius as radii, useTheme } from "@/theme/theme";

type Props = {
  children?: ReactNode;
  radius?: number;
  /** Denser fill for content-heavy glass (cards that hold text blocks). */
  strong?: boolean;
  /** Drop the outer shadow (e.g. for glass nested inside glass). */
  flat?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

/**
 * The one glass primitive. With blur enabled: blurred backdrop + translucent
 * fill + hairline border + top highlight. Without blur (low-end Android, Reduce
 * Transparency, or the user's setting): a near-opaque tinted fill, same shape.
 * Never nest more than two GlassSurface layers.
 */
export function GlassSurface({ children, radius = radii.lg, strong, flat, style, contentStyle }: Props) {
  const { glass, isDark, blurEnabled } = useTheme();
  const fill = blurEnabled ? (strong ? glass.surfaceStrong : glass.surface) : glass.fallbackSurface;

  return (
    <View
      style={[
        { borderRadius: radius },
        !flat && Platform.OS === "ios" && {
          shadowColor: glass.shadow, shadowOpacity: 1, shadowRadius: 24, shadowOffset: { width: 0, height: 10 },
        },
        style,
      ]}
    >
      <View style={[styles.clip, { borderRadius: radius, borderColor: glass.border }]}>
        {blurEnabled ? (
          <BlurView intensity={glass.blur} tint={isDark ? "dark" : "light"} style={StyleSheet.absoluteFill} />
        ) : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: fill }]} pointerEvents="none" />
        <LinearGradient
          colors={[glass.highlight, "transparent"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.highlight}
          pointerEvents="none"
        />
        <View style={contentStyle}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden", borderWidth: StyleSheet.hairlineWidth },
  highlight: { position: "absolute", top: 0, left: 0, right: 0, height: 28, opacity: 0.35 },
});
