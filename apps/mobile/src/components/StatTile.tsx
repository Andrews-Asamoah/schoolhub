import type { ReactNode } from "react";
import {} from "react-native";
import { Text } from "./Typography";
import Animated, { FadeIn } from "react-native-reanimated";
import type { Hue } from "@/theme/palette";
import { type, useTheme } from "@/theme/theme";
import { Card } from "./Surface";
import { IconChip, StatusPill } from "./ModulePrimitives";
const AnimatedText = Animated.createAnimatedComponent(Text);
type Tone = "neutral" | "success" | "warning" | "destructive" | "info";
const tones: Record<Tone, Hue> = {
  neutral: "indigo",
  success: "emerald",
  warning: "amber",
  destructive: "rose",
  info: "sky",
};
export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  hue,
  delta,
  sparkline,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  tone?: Tone;
  hue?: Hue;
  delta?: string;
  sparkline?: ReactNode;
}) {
  const { colors, reduceMotion } = useTheme();
  const colour = hue ?? tones[tone];
  return (
    <Card style={{ flex: 1, gap: 12 }}>
      {icon ? <IconChip hue={colour}>{icon}</IconChip> : null}
      <Text style={[type.caption, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <AnimatedText
        key={value}
        entering={reduceMotion ? undefined : FadeIn.duration(200)}
        accessibilityLabel={`${label}: ${value}`}
        style={[
          type.display,
          { color: colors.foreground, fontVariant: ["tabular-nums"] },
        ]}
      >
        {value}
      </AnimatedText>
      {delta ? <StatusPill label={delta} hue={colour} /> : null}
      {hint ? (
        <Text style={[type.caption, { color: colors.mutedForeground }]}>
          {hint}
        </Text>
      ) : null}
      {sparkline}
    </Card>
  );
}
