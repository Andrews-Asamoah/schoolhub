import Svg, { Circle, Path, Rect } from "react-native-svg";
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
  return (
    <Svg
      width={112}
      height={96}
      viewBox="0 0 112 96"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Circle cx={56} cy={48} r={44} fill={p.tint} />
      <Rect x={30} y={20} width={52} height={58} rx={12} fill={p.solid} />
      <Path
        d="M42 36h28M42 46h18"
        stroke="#FFFFFF"
        strokeWidth={4}
        strokeLinecap="round"
      />
      {error ? (
        <Path
          d="M56 56v7m0 6v1"
          stroke="#FFFFFF"
          strokeWidth={4}
          strokeLinecap="round"
        />
      ) : (
        <Path
          d="m44 62 8 7 16-15"
          stroke="#FFFFFF"
          fill="none"
          strokeWidth={4}
          strokeLinecap="round"
        />
      )}
    </Svg>
  );
}
