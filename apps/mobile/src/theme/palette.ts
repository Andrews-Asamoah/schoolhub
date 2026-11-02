/** Additive mobile palette. Generated web tokens remain untouched. */
export type Hue =
  | "indigo"
  | "emerald"
  | "amber"
  | "teal"
  | "sky"
  | "rose"
  | "violet"
  | "orange"
  | "pink";
export type PaletteScheme = "light" | "dark";
export const hueValues: Record<Hue, readonly [string, string]> = {
  indigo: ["#4338CA", "#A5B4FC"],
  emerald: ["#047857", "#34D399"],
  amber: ["#B45309", "#FBBF24"],
  teal: ["#0F766E", "#2DD4BF"],
  sky: ["#0369A1", "#38BDF8"],
  rose: ["#BE123C", "#FB7185"],
  violet: ["#6D28D9", "#C4B5FD"],
  orange: ["#C2410C", "#FB923C"],
  pink: ["#BE185D", "#F472B6"],
};
export const neutrals = {
  light: {
    background: "#F5F6FB",
    card: "#FFFFFF",
    elevated: "#FFFFFF",
    foreground: "#0F1530",
    mutedForeground: "#4B5675",
    border: "#CCD2E0",
  },
  dark: {
    background: "#0B1020",
    card: "#141B31",
    elevated: "#1D2740",
    foreground: "#E8ECF8",
    mutedForeground: "#9BA7C4",
    border: "#46516C",
  },
} as const;
function rgb(hex: string) {
  const h = hex.slice(1);
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}
export function blend(a: string, b: string, t: number): string {
  const x = rgb(a),
    y = rgb(b);
  return (
    "#" +
    x
      .map((v, i) =>
        Math.round(v + (y[i]! - v) * t)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
export function contrast(a: string, b: string): number {
  const luminance = (h: string) =>
    rgb(h)
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i]!, 0);
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function safeHex(
  value: string | null | undefined,
  fallback: string,
): string {
  return value && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
    ? value.trim()
    : fallback;
}
/** Smallest blend towards black/white that meets the requested contrast. */
export function ensureContrast(
  foreground: string,
  background: string,
  minimum = 4.5,
): string {
  if (contrast(foreground, background) >= minimum) return foreground;
  const target =
    contrast("#FFFFFF", background) > contrast("#000000", background)
      ? "#FFFFFF"
      : "#000000";
  for (let i = 1; i <= 100; i++) {
    const result = blend(foreground, target, i / 100);
    if (contrast(result, background) >= minimum) return result;
  }
  return target;
}
export function modulePalette(hue: Hue, scheme: PaletteScheme = "light") {
  const [solid, darkInk] = hueValues[hue];
  const base = neutrals[scheme];
  const tint = blend(
    base.card,
    scheme === "light" ? solid : darkInk,
    scheme === "light" ? 0.12 : 0.16,
  );
  const ink = ensureContrast(scheme === "light" ? solid : darkInk, tint);
  return {
    solid,
    ink,
    tint,
    onSolid: "#FFFFFF",
    gradient: [
      solid,
      ensureContrast(blend(solid, "#6D28D9", 0.4), "#FFFFFF"),
    ] as const,
  };
}
export function brandPalette(
  primary?: string | null,
  secondary?: string | null,
  scheme: PaletteScheme = "light",
) {
  const solid = ensureContrast(safeHex(primary, "#4338CA"), "#FFFFFF");
  const end = ensureContrast(
    blend(solid, safeHex(secondary, "#6D28D9"), 0.45),
    "#FFFFFF",
  );
  return {
    solid,
    gradient: [solid, end] as const,
    focus: ensureContrast(safeHex(primary, "#4338CA"), neutrals[scheme].card),
    onSolid: "#FFFFFF",
  };
}
/** Deterministic rendering decisions, also tested with a synthetic low-memory profile. */
export function shouldBlur(
  platform: string,
  memory: number | null,
  preference: "auto" | "on" | "off",
  reduceTransparency: boolean,
) {
  return (
    !reduceTransparency &&
    preference !== "off" &&
    (preference === "on" ||
      platform !== "android" ||
      (typeof memory === "number" && memory >= 3 * 1024 ** 3))
  );
}
