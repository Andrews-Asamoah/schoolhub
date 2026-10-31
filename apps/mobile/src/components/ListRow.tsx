import { ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { spacing, type, useTheme } from "@/theme/theme";

type Props = {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  divider?: boolean;
};

export function ListRow({ title, subtitle, leading, trailing, onPress, chevron, divider }: Props) {
  const { colors, glass } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, divider && { borderBottomColor: glass.border, borderBottomWidth: StyleSheet.hairlineWidth }, pressed && { opacity: 0.6 }]}
    >
      {leading}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={[type.bodyStrong, { color: colors.foreground }]}>{title}</Text>
        {subtitle ? <Text numberOfLines={2} style={[type.caption, { color: colors.mutedForeground }]}>{subtitle}</Text> : null}
      </View>
      {trailing}
      {chevron ? <ChevronRight size={18} color={colors.mutedForeground} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
});
