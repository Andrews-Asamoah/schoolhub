import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/Typography";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { elevation, fonts, radius, useTheme } from "@/theme/theme";

type Variant = "primary" | "secondary" | "ghost" | "destructive";

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  /** Stretch to the full width of the parent (default true). */
  block?: boolean;
  haptic?: boolean;
};

export function Button({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon,
  block = true,
  haptic = true,
}: Props) {
  const { colors, accent, heroGradient, reduceMotion, scheme } = useTheme();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const inactive = disabled || loading;

  const fg =
    variant === "primary"
      ? "#FFFFFF"
      : variant === "destructive"
        ? colors.destructiveForeground
        : variant === "secondary"
          ? colors.foreground
          : accent;

  const content = (
    <View style={styles.row}>
      {loading ? <ActivityIndicator color={fg} /> : icon}
      <Text style={[styles.label, { color: fg, fontFamily: fonts.bold }]}>
        {label}
      </Text>
    </View>
  );

  return (
    <Animated.View
      style={[
        block && { alignSelf: "stretch" },
        { borderRadius: radius.xl },
        variant === "primary" && !inactive
          ? elevation(scheme, 1, heroGradient?.[0] ?? accent)
          : null,
        style,
        inactive && { opacity: 0.5 },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!inactive, busy: !!loading }}
        accessibilityLabel={label}
        disabled={inactive}
        onPressIn={() => {
          if (!reduceMotion)
            scale.set(withSpring(0.97, { damping: 18, stiffness: 320 }));
        }}
        onPressOut={() => {
          scale.set(withSpring(1, { damping: 18, stiffness: 320 }));
        }}
        onPress={() => {
          if (haptic)
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPress?.();
        }}
        style={[
          styles.base,
          variant === "secondary" && {
            backgroundColor: colors.card,
            borderColor: colors.input,
            borderWidth: 1.5,
          },
          variant === "destructive" && { backgroundColor: colors.destructive },
          variant === "ghost" && { backgroundColor: "transparent" },
        ]}
      >
        {variant === "primary" ? (
          <LinearGradient
            colors={heroGradient ?? [accent, accent]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {content}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 56,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    paddingHorizontal: 20,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
  },
  label: {
    fontSize: 16,
    letterSpacing: -0.1,
    flexShrink: 1,
    textAlign: "center",
  },
});
