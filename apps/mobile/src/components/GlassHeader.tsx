import { View, StyleSheet } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, useTheme } from "@/theme/theme";
import { GlassSurface } from "./GlassSurface";
import type { ReactNode } from "react";

export const HEADER_BAR_HEIGHT = 52;

type Props = {
  title: string;
  scrollY: SharedValue<number>;
  left?: ReactNode;
  right?: ReactNode;
};

/**
 * Compact top bar. It is invisible at rest (the large title in the screen body
 * is showing) and fades in as a glass bar with the title once scrolled.
 */
export function GlassHeader({ title, scrollY, left, right }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const barStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [20, 70], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <View style={[styles.wrap, { paddingTop: insets.top }]} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, barStyle]} pointerEvents="none">
        <GlassSurface radius={0} flat style={StyleSheet.absoluteFill} contentStyle={StyleSheet.absoluteFill}>
          {null}
        </GlassSurface>
      </Animated.View>
      <View style={styles.row} pointerEvents="box-none">
        <View style={styles.side}>{left}</View>
        <Animated.Text
          numberOfLines={1}
          accessibilityRole="header"
          style={[{ fontFamily: fonts.semibold, fontSize: 17, color: colors.foreground }, styles.title, barStyle]}
        >
          {title}
        </Animated.Text>
        <View style={[styles.side, { alignItems: "flex-end" }]}>{right}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10 },
  row: { height: HEADER_BAR_HEIGHT, flexDirection: "row", alignItems: "center", paddingHorizontal: 16 },
  side: { width: 72, justifyContent: "center" },
  title: { flex: 1, textAlign: "center" },
});
