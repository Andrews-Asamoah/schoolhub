import { useId } from "react";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";
import { modulePalette, type Hue } from "@/theme/palette";
import { useTheme } from "@/theme/theme";
/** Decorative module-coloured empty/error art. The adjacent heading carries meaning. */
export function StateIllustration({
  hue = "indigo",
  error = false,
}: {
  hue?: Hue;
  error?: boolean;
}) {
  const { scheme } = useTheme();
  const p = modulePalette(hue, scheme);
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <Svg
      width={128}
      height={108}
      viewBox="0 0 128 108"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <LinearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor={p.gradient[0]} />
          <Stop offset="1" stopColor={p.gradient[1]} />
        </LinearGradient>
      </Defs>
      <Circle cx={64} cy={54} r={50} fill={p.tint} />
      <Circle cx={22} cy={30} r={5} fill={p.edge} />
      <Circle cx={108} cy={80} r={7} fill={p.edge} />
      <Circle cx={104} cy={26} r={3.5} fill={p.edge} />
      <Rect
        x={36}
        y={28}
        width={56}
        height={62}
        rx={16}
        fill={p.edge}
        transform="rotate(-8 64 59)"
      />
      <Rect
        x={36}
        y={22}
        width={56}
        height={62}
        rx={16}
        fill={`url(#${id}g)`}
      />
      <Path
        d="M48 40h32M48 51h20"
        stroke="#FFFFFF"
        strokeWidth={4.5}
        strokeLinecap="round"
      />
      {error ? (
        <Path
          d="M64 60v8m0 7v1"
          stroke="#FFFFFF"
          strokeWidth={4.5}
          strokeLinecap="round"
        />
      ) : (
        <Path
          d="m52 68 8 7 16-15"
          stroke="#FFFFFF"
          fill="none"
          strokeWidth={4.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </Svg>
  );
}
