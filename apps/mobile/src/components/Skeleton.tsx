import { useEffect, useState } from "react";
import type { DimensionValue, StyleProp, ViewStyle } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { View } from "react-native";
import { Card } from "./Surface";
import { useTheme } from "@/theme/theme";

type Props = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/** UI-thread shimmer; static when Reduce Motion is enabled. */
export function Skeleton({
  width = "100%",
  height = 16,
  radius = 8,
  style,
}: Props) {
  const { colors, reduceMotion } = useTheme();
  const [measuredWidth, setWidth] = useState(0);
  const progress = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(progress);
    progress.set(0);
    if (!reduceMotion)
      progress.set(withRepeat(withTiming(1, { duration: 1200 }), -1, false));
    return () => cancelAnimation(progress);
  }, [reduceMotion, progress]);
  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.value * 2 - 1) * measuredWidth }],
  }));
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.muted,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {!reduceMotion && measuredWidth > 0 ? (
        <Animated.View
          style={[
            { position: "absolute", top: 0, bottom: 0, width: measuredWidth },
            animated,
          ]}
        >
          <LinearGradient
            colors={["transparent", colors.border, "transparent"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      ) : null}
    </View>
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
