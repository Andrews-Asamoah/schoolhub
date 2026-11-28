import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/Typography";
import { fonts, radius, spacing, useTheme } from "@/theme/theme";

type Variant = "primary" | "secondary" | "ghost" | "destructive";

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
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
  const { colors, heroGradient } = useTheme();
  const inactive = !!(disabled || loading);
  const theme = {
    primary: {
      bg: heroGradient?.[0] ?? colors.primary,
      fg: heroGradient ? "#FFFFFF" : colors.primaryForeground,
      edge: "transparent",
    },
    secondary: { bg: colors.card, fg: colors.foreground, edge: colors.input },
    ghost: { bg: "transparent", fg: colors.primary, edge: "transparent" },
    destructive: {
      bg: colors.destructive,
      fg: colors.destructiveForeground,
      edge: "transparent",
    },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: !!loading }}
      accessibilityLabel={label}
      disabled={inactive}
      onPress={() => {
        if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.button,
        block ? styles.block : styles.inline,
        {
          backgroundColor:
            inactive && !loading
              ? colors.muted
              : pressed && variant === "ghost"
                ? colors.muted
                : theme.bg,
          borderColor: inactive && !loading ? "transparent" : theme.edge,
          opacity: pressed ? 0.84 : 1,
        },
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator color={theme.fg} /> : icon}
        <Text
          style={[
            styles.label,
            { color: inactive && !loading ? colors.mutedForeground : theme.fg },
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  block: { alignSelf: "stretch" },
  inline: { alignSelf: "flex-start" },
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  content: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  label: {
    fontFamily: fonts.semibold,
    fontSize: 15,
    lineHeight: 20,
    flexShrink: 1,
    textAlign: "center",
  },
});
