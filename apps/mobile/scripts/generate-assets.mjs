import { writeFile } from "node:fs/promises";
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
const favicon = await tile(64, 58, transparent);
await writeFile(asset("favicon.png"), favicon);

const webPublic = new URL("../../web/public/", import.meta.url);
await writeFile(new URL("schoolhub-favicon.png", webPublic), favicon);
await sharp(await tile(256, 228, transparent))
  .webp({ quality: 92 })
  .toFile(fileURLToPath(new URL("schoolhub.webp", webPublic)));

const desktopIcons = new URL("../../desktop/src-tauri/icons/", import.meta.url);
const sizes = [256, 128, 64, 48, 32, 24, 16];
const frames = await Promise.all(
  sizes.map((size) => tile(size, Math.round(size * 0.9), transparent)),
);
await writeFile(new URL("icon.png", desktopIcons), frames[0]);

// Windows ICO directory followed by the transparent PNG frames.
const directory = Buffer.alloc(6 + 16 * sizes.length);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
for (const [index, size] of sizes.entries()) {
  const entry = 6 + index * 16;
  directory[entry] = directory[entry + 1] = size % 256;
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(frames[index].length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += frames[index].length;
}
await writeFile(new URL("icon.ico", desktopIcons), Buffer.concat([directory, ...frames]));
