import type { ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { modulePalette, type Hue } from "@/theme/palette";
import { radius, spacing, useTheme } from "@/theme/theme";
type Props = {
  children?: ReactNode;
  padding?: number;
  hue?: Hue;
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
};
/** Opaque surfaces for all data, including cards nested inside chrome. */
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
          borderWidth: 1,
          borderColor: colors.border,
        },
        elevated && { boxShadow: "0px 4px 16px rgba(10,20,48,0.08)" },
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
