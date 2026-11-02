import { useEffect } from "react";
import type { DimensionValue, StyleProp, ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { View } from "react-native";
import { Card } from "./Surface";
import { useTheme } from "@/theme/theme";

type Props = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/** Placeholder block. Pulses softly; stays still when Reduce Motion is on. */
export function Skeleton({
  width = "100%",
  height = 16,
  radius = 8,
  style,
}: Props) {
  const { colors, reduceMotion } = useTheme();
  const opacity = useSharedValue(0.55);
  useEffect(() => {
    cancelAnimation(opacity);
    if (reduceMotion) {
      opacity.set(1);
      return;
    }
    opacity.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: 800 }),
          withTiming(0.55, { duration: 800 }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(opacity);
  }, [reduceMotion, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: radius, backgroundColor: colors.muted },
        animated,
        style,
      ]}
    />
  );
}

export function SkeletonRow() {
  return (
    <View style={{ flexDirection: "row", gap: 12, paddingVertical: 12 }}>
      <Skeleton width={44} height={44} radius={16} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="60%" />
        <Skeleton width="85%" height={14} />
      </View>
    </View>
  );
}
export function SkeletonTile() {
  return (
    <Card style={{ gap: 16 }}>
      <Skeleton width={44} height={44} />
      <Skeleton width="60%" />
      <Skeleton width="45%" height={34} />
    </Card>
  );
}
export function SkeletonHero() {
  return (
    <Card style={{ gap: 16 }}>
      <Skeleton width="50%" />
      <Skeleton width="85%" height={28} />
      <Skeleton height={40} />
    </Card>
  );
}
