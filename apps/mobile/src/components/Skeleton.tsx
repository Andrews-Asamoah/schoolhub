import { useEffect } from "react";
import type { DimensionValue, StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useTheme } from "@/theme/theme";

type Props = { width?: DimensionValue; height?: number; radius?: number; style?: StyleProp<ViewStyle> };

/** Placeholder block. Pulses softly; stays still when Reduce Motion is on. */
export function Skeleton({ width = "100%", height = 16, radius = 8, style }: Props) {
  const { colors, reduceMotion } = useTheme();
  const opacity = useSharedValue(0.55);
  useEffect(() => {
    if (reduceMotion) return;
    opacity.set(withRepeat(withSequence(withTiming(1, { duration: 800 }), withTiming(0.55, { duration: 800 })), -1));
  }, [reduceMotion, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: colors.muted }, animated, style]}
    />
  );
}
