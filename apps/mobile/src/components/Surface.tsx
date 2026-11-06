import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { modulePalette, type Hue } from "@/theme/palette";
import { elevation, radius, spacing, useTheme } from "@/theme/theme";
type Props = {
  children?: ReactNode;
  padding?: number;
  hue?: Hue;
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
};
/**
 * Opaque surfaces for all data, including cards nested inside chrome.
 * `Surface` is flat (hairline outline); `Card` floats on a soft tinted shadow.
 * A `hue` washes the surface in that module's colour.
 */
export function Surface({
  children,
  padding = spacing.lg,
  hue,
  elevated = false,
  style,
}: Props) {
  const { colors, scheme } = useTheme();
  const module = hue ? modulePalette(hue, scheme) : null;
  return (
    <View
      style={[
        {
          padding,
          borderRadius: radius.xl,
          backgroundColor:
            module?.tint ?? (elevated ? colors.popover : colors.card),
          borderWidth:
            scheme === "dark" || module ? 1 : StyleSheet.hairlineWidth,
          borderColor: module ? module.edge : colors.border,
        },
        elevated && !module ? elevation(scheme, 2) : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Card(props: Props) {
  return <Surface elevated {...props} />;
}
