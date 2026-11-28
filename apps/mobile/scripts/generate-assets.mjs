import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Use Expo's installed image toolchain without adding a runtime dependency.
const require = createRequire(import.meta.url);
const expoRequire = createRequire(require.resolve("expo/package.json"));
const sharp = expoRequire("sharp");
const folder = new URL("../assets/", import.meta.url);
const asset = (name) => fileURLToPath(new URL(name, folder));
const artwork = asset("schoolhub-mark.png");
const paper = "#FFF9ED";
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

// Add margins after resizing so the artwork stays within Android's mask area.
async function tile(size, symbolWidth, background) {
  const mark = await sharp(artwork)
    .resize({ width: symbolWidth })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background },
  })
    .composite([{ input: mark, gravity: "centre" }])
    .png()
    .toBuffer();
}

const icon = await tile(1024, 632, paper);
await sharp(icon).removeAlpha().toFile(asset("icon.png"));
await sharp(await tile(1024, 600, transparent)).toFile(
  asset("adaptive-foreground.png"),
);
await sharp({
  create: { width: 1024, height: 1024, channels: 3, background: paper },
})
  .png()
  .toFile(asset("adaptive-background.png"));
await sharp(await tile(512, 410, paper)).toFile(asset("splash.png"));
await sharp(await tile(128, 102, paper))
  .resize(64, 64)
  .toFile(asset("favicon.png"));
const webPublic = new URL("../../web/public/", import.meta.url);
await sharp(await tile(256, 196, paper))
  .webp({ quality: 92 })
  .toFile(fileURLToPath(new URL("schoolhub.webp", webPublic)));
