import { useId, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { backdropWashes } from "@/theme/palette";
import { useTheme } from "@/theme/theme";

/**
 * Atmospheric background that surfaces sit on: two soft radial glows (the
 * school's primary top-right, its secondary mid-left) over the canvas colour.
 * Strength is capped per colour by `backdropWashes`, so any tenant colour
 * keeps text readable (the contrast audit exercises the same function).
 */
export function Backdrop() {
  const { colors, accent, accentSecondary, scheme } = useTheme();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const primary = accent ?? colors.primary;
  const secondary = accentSecondary ?? primary;
  const mode = scheme === "dark" ? "dark" : "light";
  const alpha = useMemo(() => {
    const w = backdropWashes(primary, secondary, mode);
    return { primary: w.primary.alpha, secondary: w.secondary.alpha };
  }, [primary, secondary, mode]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height={560} style={styles.top}>
        <Defs>
          <RadialGradient
            id={`${id}a`}
            cx="88%"
            cy="0%"
            r="80%"
            fx="88%"
            fy="0%"
          >
            <Stop offset="0" stopColor={primary} stopOpacity={alpha.primary} />
            <Stop offset="1" stopColor={primary} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient
            id={`${id}b`}
            cx="-5%"
            cy="32%"
            r="70%"
            fx="-5%"
            fy="32%"
          >
            <Stop
              offset="0"
              stopColor={secondary}
              stopOpacity={alpha.secondary}
            />
            <Stop offset="1" stopColor={secondary} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}a)`} />
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id}b)`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: "absolute", top: 0, left: 0, right: 0 },
});
