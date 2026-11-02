import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/Typography";
import { fonts, radius, useTheme } from "@/theme/theme";

type Props<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
};

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
        { backgroundColor: colors.card, borderColor: colors.border },
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
            style={[
              styles.item,
              selected && { backgroundColor: colors.accent },
            ]}
          >
            <Text
              style={{
                fontFamily: selected ? fonts.semibold : fonts.medium,
                fontSize: 14,
                color: selected
                  ? colors.accentForeground
                  : colors.mutedForeground,
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
    padding: 4,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  item: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
