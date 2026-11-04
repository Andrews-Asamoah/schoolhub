import {
  backdropAlpha,
  backdropWashes,
  brandPalette,
  contrast,
  hueForName,
  hueValues,
  modulePalette,
  neutrals,
  shouldBlur,
  safeHex,
} from "@/theme/palette";
for (const scheme of ["light", "dark"] as const) {
  test(`${scheme}: every module label remains readable on both card and tint`, () => {
    for (const hue of Object.keys(hueValues) as (keyof typeof hueValues)[]) {
      const p = modulePalette(hue, scheme);
      expect(contrast(p.ink, p.tint)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.ink, neutrals[scheme].card)).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });
  test(`${scheme}: hostile tenant colours cannot break white hero text or focus`, () => {
    for (const colour of [
      "#fff",
      "#000",
      "#ff0",
      "#0f0",
      "#0ff",
      "#F00",
      "#808080",
      "bad",
    ]) {
      const p = brandPalette(colour, "#FFF", scheme);
      p.gradient.forEach((bg) =>
        expect(contrast("#FFFFFF", bg)).toBeGreaterThanOrEqual(4.5),
      );
      expect(contrast(p.focus, neutrals[scheme].card)).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });
}
test("colour validation excludes CSS injection and accepts short hex", () => {
  expect(safeHex("url(secret)", "#4338CA")).toBe("#4338CA");
  expect(safeHex(" #abc ", "#4338CA")).toBe("#abc");
});
test("low-memory or unknown Android uses fallback, including reduce transparency", () => {
  expect(shouldBlur("android", 2 * 1024 ** 3, "auto", false)).toBe(false);
  expect(shouldBlur("android", null, "auto", false)).toBe(false);
  expect(shouldBlur("android", 4 * 1024 ** 3, "auto", false)).toBe(true);
  expect(shouldBlur("ios", null, "on", true)).toBe(false);
  expect(shouldBlur("ios", null, "off", false)).toBe(false);
});
test("avatar hues are stable per name and always a known hue", () => {
  const known = Object.keys(hueValues);
  for (const name of ["Ama Mensah", "Kofi", "", "Zoë Å"]) {
    expect(hueForName(name)).toBe(hueForName(name));
    expect(known).toContain(hueForName(name));
  }
});
test("backdrop washes are dimmed until text stays readable, for any tenant colour", () => {
  for (const scheme of ["light", "dark"] as const) {
    for (const colour of ["#fff", "#000", "#ff0", "#0ff", "#4F46E5"]) {
      const b = brandPalette(colour, "#0ff", scheme);
      const w = backdropWashes(b.focus, b.gradient[1], scheme);
      expect(w.primary.alpha).toBeLessThanOrEqual(
        backdropAlpha[scheme].primary,
      );
      expect(
        contrast(neutrals[scheme].foreground, w.composite),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(neutrals[scheme].mutedForeground, w.composite),
      ).toBeGreaterThanOrEqual(4.5);
    }
  }
});
