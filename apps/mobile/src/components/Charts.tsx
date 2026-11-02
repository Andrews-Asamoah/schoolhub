import { useEffect } from "react";
import { Text, View } from "react-native";
import Svg, { Circle, Polyline, Rect } from "react-native-svg";
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { modulePalette, type Hue } from "@/theme/palette";
import { type, useTheme } from "@/theme/theme";
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
export type ChartValue = { label: string; value: number; hue?: Hue };
export function chartValues(data: readonly ChartValue[]) {
  return data.map((d) => ({
    ...d,
    value: Number.isFinite(d.value) ? Math.max(0, d.value) : 0,
  }));
}
function Legend({
  label,
  data,
}: {
  label: string;
  data: readonly ChartValue[];
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text
        accessibilityRole="header"
        style={[type.headline, { color: colors.foreground }]}
      >
        {label}
      </Text>
      {data.map((d, i) => (
        <Text
          key={`${d.label}-${i}`}
          style={[type.caption, { color: colors.mutedForeground }]}
        >
          {d.label}: {d.value}
        </Text>
      ))}
    </View>
  );
}
export function ProgressRing({
  label,
  value,
  total = 100,
  hue = "emerald",
}: {
  label: string;
  value: number;
  total?: number;
  hue?: Hue;
}) {
  const { scheme, colors, reduceMotion } = useTheme();
  const progress =
    total > 0 && Number.isFinite(total) && Number.isFinite(value)
      ? Math.max(0, Math.min(1, value / total))
      : 0;
  const amount = useSharedValue(progress);
  useEffect(() => {
    amount.set(
      reduceMotion ? progress : withTiming(progress, { duration: 220 }),
    );
  }, [progress, reduceMotion, amount]);
  const animated = useAnimatedProps(() => ({
    strokeDashoffset: 251.327 * (1 - amount.value),
  }));
  return (
    <View style={{ gap: 12, alignItems: "center" }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Svg width={104} height={104} viewBox="0 0 104 104">
          <Circle
            cx={52}
            cy={52}
            r={40}
            fill="none"
            stroke={colors.border}
            strokeWidth={9}
          />
          <AnimatedCircle
            cx={52}
            cy={52}
            r={40}
            fill="none"
            stroke={modulePalette(hue, scheme).ink}
            strokeWidth={9}
            strokeLinecap="round"
            strokeDasharray="251.327"
            rotation={-90}
            origin="52,52"
            animatedProps={animated}
          />
        </Svg>
      </View>
      <Text
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{
          min: 0,
          max: 100,
          now: Math.round(progress * 100),
          text: `${Math.round(progress * 100)}%`,
        }}
        style={[type.headline, { color: colors.foreground }]}
      >
        {label} · {Math.round(progress * 100)}%
      </Text>
    </View>
  );
}
export function BarChart({
  label,
  data,
}: {
  label: string;
  data: readonly ChartValue[];
}) {
  const { scheme } = useTheme();
  const values = chartValues(data);
  const max = Math.max(1, ...values.map((d) => d.value));
  const step = 300 / Math.max(1, values.length);
  return (
    <View style={{ gap: 12 }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Svg width="100%" height={144} viewBox="0 0 300 144">
          {values.map((d, i) => (
            <Rect
              key={i}
              x={i * step + step * 0.15}
              y={132 - (d.value / max) * 120}
              width={step * 0.7}
              height={(d.value / max) * 120}
              rx={4}
              fill={modulePalette(d.hue ?? "indigo", scheme).ink}
            />
          ))}
        </Svg>
      </View>
      <Legend label={label} data={values} />
    </View>
  );
}
export function Sparkline({
  label,
  data,
  hue = "indigo",
}: {
  label: string;
  data: readonly ChartValue[];
  hue?: Hue;
}) {
  const { scheme } = useTheme();
  const values = chartValues(data);
  const max = Math.max(1, ...values.map((d) => d.value));
  const points = values
    .map(
      (d, i) =>
        `${8 + (i * 284) / Math.max(1, values.length - 1)},${64 - (d.value / max) * 56}`,
    )
    .join(" ");
  return (
    <View style={{ gap: 8 }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Svg width="100%" height={72} viewBox="0 0 300 72">
          <Polyline
            points={points}
            stroke={modulePalette(hue, scheme).ink}
            strokeWidth={3}
            fill="none"
          />
          {values.length === 1 ? (
            <Circle
              cx={8}
              cy={64 - (values[0]!.value / max) * 56}
              r={3}
              fill={modulePalette(hue, scheme).ink}
            />
          ) : null}
        </Svg>
      </View>
      <Legend label={label} data={values} />
    </View>
  );
}
export function DonutChart({
  label,
  data,
}: {
  label: string;
  data: readonly ChartValue[];
}) {
  const { scheme, colors } = useTheme();
  const values = chartValues(data);
  const total = values.reduce((s, d) => s + d.value, 0);

  return (
    <View style={{ gap: 12 }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Svg width={160} height={160} viewBox="0 0 160 160">
          <Circle
            cx={80}
            cy={80}
            r={58}
            stroke={colors.border}
            strokeWidth={18}
            fill="none"
          />
          {values.map((d, i) => {
            const length = total > 0 ? (d.value / total) * 364.425 : 0;
            const start =
              total > 0
                ? (values
                    .slice(0, i)
                    .reduce((sum, item) => sum + item.value, 0) /
                    total) *
                  364.425
                : 0;
            return (
              <Circle
                key={i}
                cx={80}
                cy={80}
                r={58}
                fill="none"
                stroke={modulePalette(d.hue ?? "indigo", scheme).ink}
                strokeWidth={18}
                strokeDasharray={`${length} ${364.425 - length}`}
                strokeDashoffset={-start}
                rotation={-90}
                origin="80,80"
              />
            );
          })}
        </Svg>
      </View>
      <Legend label={label} data={values} />
    </View>
  );
}
