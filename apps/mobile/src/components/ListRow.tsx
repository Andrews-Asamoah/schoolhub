import type { Hue } from "@/theme/palette";
import { StatusPill } from "./ModulePrimitives";
import { ChevronRight } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/components/Typography";
import { spacing, type, useTheme } from "@/theme/theme";

type Props = {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  divider?: boolean;
  status?: string;
  hue?: Hue;
};

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  chevron,
  divider,
  status,
  hue,
}: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.row,
        divider && {
          borderBottomColor: colors.border,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
        pressed && { opacity: 0.6 },
      ]}
    >
      {leading}
      <View style={{ flex: 1 }}>
        <Text style={[type.bodyStrong, { color: colors.foreground }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[type.caption, { color: colors.mutedForeground }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {status ? (
        <View style={{ maxWidth: "40%" }}>
          <StatusPill label={status} hue={hue} />
        </View>
      ) : (
        trailing
      )}
      {chevron ? (
        <ChevronRight size={18} color={colors.mutedForeground} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
});
