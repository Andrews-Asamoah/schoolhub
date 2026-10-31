import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { spacing, type, useTheme, withAlpha } from "@/theme/theme";
import { GlassCard } from "./GlassCard";

type Tone = "neutral" | "success" | "warning" | "destructive" | "info";

type Props = { label: string; value: string; hint?: string; icon?: ReactNode; tone?: Tone };

export function StatTile({ label, value, hint, icon, tone = "neutral" }: Props) {
  const { colors, accent } = useTheme();
  const toneColor = tone === "neutral" ? accent : colors[tone];
  return (
    <GlassCard padding={spacing.lg} style={{ flex: 1 }}>
      <View style={{ gap: spacing.sm }}>
        {icon ? (
          <View style={{ width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: withAlpha(toneColor, 0.14) }}>
            {icon}
          </View>
        ) : null}
        <Text style={[type.overline, { color: colors.mutedForeground }]}>{label.toUpperCase()}</Text>
        <Text accessibilityLabel={`${label}: ${value}`} style={[type.title, { color: colors.foreground }]}>{value}</Text>
        {hint ? <Text style={[type.caption, { color: tone === "neutral" ? colors.mutedForeground : toneColor }]}>{hint}</Text> : null}
      </View>
    </GlassCard>
  );
}
