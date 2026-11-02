import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Use Expo's installed image toolchain; no runtime dependency is added.
const require = createRequire(import.meta.url);
const expoRequire = createRequire(require.resolve("expo/package.json"));
const sharp = expoRequire("sharp");
const folder = new URL("../assets/", import.meta.url);
const mark = await readFile(new URL("mark.svg", folder));
const brand = "#4338CA";
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const foreground = await sharp(mark)
  .resize(640, 640)
  .extend({
    top: 192,
    bottom: 192,
    left: 192,
    right: 192,
    background: transparent,
  })
  .png()
  .toBuffer();
const icon = await sharp({
  create: { width: 1024, height: 1024, channels: 3, background: brand },
})
  .composite([{ input: foreground }])
  .removeAlpha()
  .png()
  .toBuffer();
await sharp(icon).toFile(fileURLToPath(new URL("icon.png", folder)));
await sharp(foreground).toFile(
  fileURLToPath(new URL("adaptive-foreground.png", folder)),
);
await sharp({
  create: { width: 1024, height: 1024, channels: 3, background: brand },
})
  .png()
  .toFile(fileURLToPath(new URL("adaptive-background.png", folder)));
await sharp(mark)
  .resize(512, 512)
  .png()
  .toFile(fileURLToPath(new URL("splash.png", folder)));
await sharp(icon)
  .resize(64, 64)
  .toFile(fileURLToPath(new URL("favicon.png", folder)));
console.log(
  "Generated icon (1024), adaptive layers (1024), splash (512), favicon (64).",
);
