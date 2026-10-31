import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { radius, spacing } from "@/theme/theme";
import { GlassSurface } from "./GlassSurface";

type Props = {
  children?: ReactNode;
  padding?: number;
  strong?: boolean;
  flat?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function GlassCard({ children, padding = spacing.lg, strong, flat, style }: Props) {
  return (
    <GlassSurface radius={radius.xl} strong={strong} flat={flat} style={style} contentStyle={{ padding }}>
      {children}
    </GlassSurface>
  );
}
