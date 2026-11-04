import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/Typography";
import { elevation, fonts, radius, useTheme } from "@/theme/theme";

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
  const { colors, scheme } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, { backgroundColor: colors.muted }]}
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
              selected && {
                backgroundColor:
                  scheme === "dark" ? colors.popover : colors.card,
                ...elevation(scheme, 1),
              },
            ]}
          >
            <Text
              style={{
                fontFamily: selected ? fonts.bold : fonts.medium,
                fontSize: 14,
                color: selected ? colors.primary : colors.mutedForeground,
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
    borderRadius: radius.pill,
  },
  item: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
