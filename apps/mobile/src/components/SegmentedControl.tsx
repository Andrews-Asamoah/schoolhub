import * as Haptics from "expo-haptics";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { fonts, radius, useTheme, withAlpha } from "@/theme/theme";

type Props<T extends string> = {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
};

export function SegmentedControl<T extends string>({ options, value, onChange, accessibilityLabel }: Props<T>) {
  const { colors, glass, accent } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[styles.track, { backgroundColor: glass.surfaceStrong, borderColor: glass.border }]}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => { if (!selected) { void Haptics.selectionAsync(); onChange(o.value); } }}
            style={[styles.item, selected && { backgroundColor: withAlpha(accent, 0.16) }]}
          >
            <Text style={{ fontFamily: selected ? fonts.semibold : fonts.medium, fontSize: 14, color: selected ? accent : colors.mutedForeground }}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", padding: 4, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth },
  item: { flex: 1, minHeight: 40, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
});
