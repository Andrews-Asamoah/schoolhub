import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AccessibilityInfo, Platform, useColorScheme } from "react-native";
import {
  brandPalette,
  contrast,
  neutrals,
  safeHex,
  shouldBlur,
} from "./palette";
import { darkTokens, lightTokens, type ColorTokens } from "./tokens.generated";

export type SchemePreference = "system" | "light" | "dark";
export type BlurPreference = "auto" | "on" | "off";
export type Scheme = "light" | "dark";

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;
export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 24,
  sheet: 28,
  pill: 999,
} as const;

/** Inter, loaded in the root layout. */
export const fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

export const type = {
  display: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 40 },
  largeTitle: {
    fontFamily: fonts.bold,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.6,
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.3,
  },
  headline: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22 },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18 },
  overline: {
    fontFamily: fonts.semibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
  },
} as const;

export type GlassTokens = {
  /** Translucent fill laid over the blur. */
  surface: string;
  /** Slightly denser fill used for content-heavy glass (cards over lists). */
  surfaceStrong: string;
  /** 1px hairline around glass. */
  border: string;
  /** Inner top edge highlight. */
  highlight: string;
  /** Blur strength (expo-blur intensity, 0-100). */
  blur: number;
  /** Used instead of blur on low-end devices: nearly opaque, still tinted. */
  fallbackSurface: string;
  shadow: string;
};

const glassLight: GlassTokens = {
  surface: "rgba(255, 255, 255, 0.94)",
  surfaceStrong: "rgba(255, 255, 255, 0.97)",
  border: "rgba(255, 255, 255, 0.7)",
  highlight: "rgba(255, 255, 255, 0.9)",
  blur: 40,
  fallbackSurface: "rgba(255, 255, 255, 0.94)",
  shadow: "rgba(30, 41, 90, 0.14)",
};

const glassDark: GlassTokens = {
  surface: "rgba(20, 27, 49, 0.94)",
  surfaceStrong: "rgba(20, 27, 49, 0.97)",
  border: "rgba(255, 255, 255, 0.14)",
  highlight: "rgba(255, 255, 255, 0.22)",
  blur: 50,
  fallbackSurface: "rgba(24, 30, 50, 0.96)",
  shadow: "rgba(0, 0, 0, 0.5)",
};

export type TenantBranding = {
  name?: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
};

type ThemeValue = {
  scheme: Scheme;
  isDark: boolean;
  colors: ColorTokens;
  glass: GlassTokens;
  /** Brand accent: the school's primary colour when set, otherwise the platform primary. */
  accent: string;
  accentSecondary: string;
  heroGradient: readonly [string, string];
  tenant: TenantBranding | null;
  schemePreference: SchemePreference;
  blurPreference: BlurPreference;
  /** True when blur will actually render. */
  blurEnabled: boolean;
  reduceMotion: boolean;
  setSchemePreference: (value: SchemePreference) => void;
  setBlurPreference: (value: BlurPreference) => void;
  setTenant: (value: TenantBranding | null) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

const SCHEME_KEY = "schoolhub:scheme-preference";
const BLUR_KEY = "schoolhub:blur-preference";
export const safeColor = safeHex;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [schemePreference, setSchemePref] =
    useState<SchemePreference>("system");
  const [blurPreference, setBlurPref] = useState<BlurPreference>("auto");
  const [tenant, setTenant] = useState<TenantBranding | null>(null);
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AsyncStorage.multiGet([SCHEME_KEY, BLUR_KEY]).then((entries) => {
      const scheme = entries[0]?.[1];
      const blur = entries[1]?.[1];
      if (scheme === "light" || scheme === "dark" || scheme === "system")
        setSchemePref(scheme);
      if (blur === "auto" || blur === "on" || blur === "off") setBlurPref(blur);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const motionSub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    let transparencySub: { remove: () => void } | undefined;
    if (Platform.OS === "ios") {
      void AccessibilityInfo.isReduceTransparencyEnabled().then(
        setReduceTransparency,
      );
      transparencySub = AccessibilityInfo.addEventListener(
        "reduceTransparencyChanged",
        setReduceTransparency,
      );
    }
    return () => {
      motionSub.remove();
      transparencySub?.remove();
    };
  }, []);

  const setSchemePreference = useCallback((value: SchemePreference) => {
    setSchemePref(value);
    void AsyncStorage.setItem(SCHEME_KEY, value);
  }, []);
  const setBlurPreference = useCallback((value: BlurPreference) => {
    setBlurPref(value);
    void AsyncStorage.setItem(BLUR_KEY, value);
  }, []);

  const scheme: Scheme =
    schemePreference === "system"
      ? system === "dark"
        ? "dark"
        : "light"
      : schemePreference;

  const value = useMemo<ThemeValue>(() => {
    const base = scheme === "dark" ? darkTokens : lightTokens;
    const mobile = neutrals[scheme];
    const colors: ColorTokens = {
      ...base,
      ...mobile,
      cardForeground: mobile.foreground,
      popover: mobile.elevated,
      popoverForeground: mobile.foreground,
    };
    const brand = brandPalette(
      tenant?.primaryColor,
      tenant?.secondaryColor,
      scheme,
    );
    const accent = brand.focus;
    const accentSecondary = brand.gradient[1];
    const blurEnabled = shouldBlur(
      Platform.OS,
      Device.totalMemory,
      blurPreference,
      reduceTransparency,
    );
    return {
      scheme,
      isDark: scheme === "dark",
      colors,
      glass: scheme === "dark" ? glassDark : glassLight,
      accent,
      accentSecondary,
      heroGradient: brand.gradient,
      tenant,
      schemePreference,
      blurPreference,
      blurEnabled,
      reduceMotion,
      setSchemePreference,
      setBlurPreference,
      setTenant,
    };
  }, [
    scheme,
    tenant,
    schemePreference,
    blurPreference,
    reduceTransparency,
    reduceMotion,
    setSchemePreference,
    setBlurPreference,
  ]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

/** Blend two hex colours (t = 0 returns a, t = 1 returns b). Used for tenant tints. */
export function mix(a: string, b: string, t: number): string {
  const parse = (hex: string): [number, number, number] => {
    const h = hex.replace("#", "");
    const full =
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const f = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${f(ar, br)}${f(ag, bg)}${f(ab, bb)}`;
}

/** "#rrggbb" + alpha 0..1 -> rgba(). */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Chooses the higher-contrast black/white foreground, including mid-grey. */
export function readableOn(hex: string): string {
  return contrast(hex, "#000000") >= contrast(hex, "#FFFFFF")
    ? "#000000"
    : "#FFFFFF";
}
