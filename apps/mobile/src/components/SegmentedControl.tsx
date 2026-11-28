import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/Typography";
import { fonts, radius, spacing, useTheme } from "@/theme/theme";

type Props<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
};

/** Sunken track with a raised thumb, the familiar iOS-style segmented switch. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: Props<T>) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.track,
        { backgroundColor: colors.muted, borderColor: colors.border },
      ]}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) {
                void Haptics.selectionAsync();
                onChange(o.value);
              }
            }}
            style={({ pressed }) => [
              styles.item,
              selected && {
                backgroundColor: colors.card,
                borderColor: colors.input,
              },
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text
              style={{
                fontFamily: selected ? fonts.bold : fonts.medium,
                fontSize: 14,
                color: selected ? colors.foreground : colors.mutedForeground,
                textAlign: "center",
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    padding: spacing.xs,
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  item: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
  },
});
