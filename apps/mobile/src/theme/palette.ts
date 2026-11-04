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
/** [solid fill (white text ≥ 4.5:1), ink used on dark surfaces]. */
export const hueValues: Record<Hue, readonly [string, string]> = {
  indigo: ["#4F46E5", "#A5B4FC"],
  emerald: ["#047857", "#34D399"],
  amber: ["#B45309", "#FBBF24"],
  teal: ["#0F766E", "#2DD4BF"],
  sky: ["#0369A1", "#38BDF8"],
  rose: ["#E11D48", "#FB7185"],
  violet: ["#7C3AED", "#C4B5FD"],
  orange: ["#C2410C", "#FB923C"],
  pink: ["#DB2777", "#F472B6"],
};
/** Second gradient stop per hue: an analogous neighbour for depth. */
export const hueGradientEnd: Record<Hue, string> = {
  indigo: "#9333EA",
  emerald: "#0891B2",
  amber: "#DC2626",
  teal: "#2563EB",
  sky: "#6D28D9",
  rose: "#A21CAF",
  violet: "#DB2777",
  orange: "#BE123C",
  pink: "#7C3AED",
};
/**
 * Neutral surfaces. Light mode is a crisp cool-white canvas with pure-white
 * cards; dark mode is a deep ink-navy with raised, slightly violet cards.
 * Mobile-only overrides of the generated web tokens.
 */
export const neutrals = {
  light: {
    background: "#F5F6FB",
    card: "#FFFFFF",
    elevated: "#FFFFFF",
    foreground: "#0E1127",
    mutedForeground: "#565B78",
    border: "#E7E9F4",
    input: "#C8CCE3",
    primary: "#4F46E5",
    primaryForeground: "#FFFFFF",
    accent: "#EAE8FF",
    accentForeground: "#2E2A8F",
    secondary: "#EDEBFA",
    secondaryForeground: "#2A2750",
    muted: "#ECEAF9",
    ring: "#7C6CF5",
  },
  dark: {
    background: "#080A18",
    card: "#12152B",
    elevated: "#1B1F3C",
    foreground: "#EEEEFF",
    mutedForeground: "#BBB9DE",
    border: "#2B2A52",
    input: "#3A3966",
    primary: "#8B8BFF",
    primaryForeground: "#0A0A24",
    accent: "#25235A",
    accentForeground: "#DAD9FF",
    secondary: "#1E1E40",
    secondaryForeground: "#DCDBF5",
    muted: "#1A1A38",
    ring: "#7C7CF0",
  },
} as const;
/**
 * Strength of the colour washes painted behind every screen. Exported so the
 * contrast audit tests exactly what the Backdrop renders.
 */
export const backdropAlpha = {
  light: { primary: 0.07, secondary: 0.04 },
  dark: { primary: 0.12, secondary: 0.08 },
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
/**
 * The strongest wash (up to `max`) of `color` over `under` that still leaves
 * body and muted text at 4.5:1. A bright or hostile tenant colour is
 * therefore dimmed automatically instead of ever hurting legibility.
 */
export function readableWash(
  color: string,
  under: string,
  scheme: PaletteScheme,
  max: number,
): number {
  const n = neutrals[scheme];
  for (let i = 0; i <= 24; i++) {
    const alpha = max * (1 - i / 24);
    const bg = blend(under, color, alpha);
    if (
      contrast(n.foreground, bg) >= 4.5 &&
      contrast(n.mutedForeground, bg) >= 4.5
    )
      return alpha;
  }
  return 0;
}
/**
 * Both backdrop glows for a pair of brand colours. The secondary glow is
 * measured on top of the primary one, the worst case where they overlap.
 */
export function backdropWashes(
  primary: string,
  secondary: string,
  scheme: PaletteScheme,
) {
  const n = neutrals[scheme];
  const max = backdropAlpha[scheme];
  const a = readableWash(primary, n.background, scheme, max.primary);
  const under = blend(n.background, primary, a);
  const b = readableWash(secondary, under, scheme, max.secondary);
  return {
    primary: { color: primary, alpha: a },
    secondary: { color: secondary, alpha: b },
    /** The darkest-case colour text can land on. */
    composite: blend(under, secondary, b),
  };
}
export function modulePalette(hue: Hue, scheme: PaletteScheme = "light") {
  const [solid, darkInk] = hueValues[hue];
  const base = neutrals[scheme];
  const tint = blend(
    base.card,
    scheme === "light" ? solid : darkInk,
    scheme === "light" ? 0.1 : 0.16,
  );
  const ink = ensureContrast(scheme === "light" ? solid : darkInk, tint);
  return {
    solid,
    ink,
    tint,
    /** A stronger wash, for borders and pressed states. */
    edge: blend(
      base.card,
      scheme === "light" ? solid : darkInk,
      scheme === "light" ? 0.22 : 0.3,
    ),
    onSolid: "#FFFFFF",
    gradient: [solid, ensureContrast(hueGradientEnd[hue], "#FFFFFF")] as const,
  };
}
/** A stable hue for a name, so avatars keep their colour between screens. */
export function hueForName(name: string): Hue {
  const order: Hue[] = [
    "indigo",
    "violet",
    "pink",
    "rose",
    "orange",
    "amber",
    "emerald",
    "teal",
    "sky",
  ];
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return order[h % order.length]!;
}
export function brandPalette(
  primary?: string | null,
  secondary?: string | null,
  scheme: PaletteScheme = "light",
) {
  const solid = ensureContrast(safeHex(primary, "#5046E5"), "#FFFFFF");
  const end = ensureContrast(
    blend(solid, safeHex(secondary, "#A237E8"), 0.6),
    "#FFFFFF",
  );
  return {
    solid,
    gradient: [solid, end] as const,
    focus: ensureContrast(safeHex(primary, "#5046E5"), neutrals[scheme].card),
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
