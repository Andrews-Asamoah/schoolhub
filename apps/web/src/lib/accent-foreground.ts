/** Black or white text, whichever reads better on the given accent colour. */
export function accessibleAccentForeground(color: string): string {
  const hex = color.trim().replace(/^#/, "");
  if (!/^(?:[\da-f]{3}|[\da-f]{6})$/i.test(hex)) return "#ffffff";
  const fullHex = hex.length === 3 ? hex.split("").map((part) => part + part).join("") : hex;
  const channels = [0, 2, 4].map((offset) => Number.parseInt(fullHex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
  const contrastWithWhite = 1.05 / (luminance + 0.05);
  const contrastWithDark = (luminance + 0.05) / 0.0535;
  return contrastWithWhite >= contrastWithDark ? "#ffffff" : "#0b0b0b";
}
