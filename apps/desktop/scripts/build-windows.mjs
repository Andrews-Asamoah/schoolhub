import { spawnSync } from "node:child_process";
import { copyFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktop = fileURLToPath(new URL("../", import.meta.url));
const target = "x86_64-pc-windows-msvc";
const debug = process.argv.includes("--debug");
const targetDir = join(desktop, "src-tauri", "target");
const { version, productName } = JSON.parse(
  readFileSync(join(desktop, "src-tauri", "tauri.conf.json"), "utf8"),
);
const args = [
  "dlx", "@tauri-apps/cli@2.12.6", "build", "--ci", "--no-bundle",
  "--features", "shell", "--target", target,
  ...(debug ? ["--debug"] : []), "--", "--locked",
];
const windows = process.platform === "win32";
const result = spawnSync(windows ? "pnpm.cmd" : "pnpm", args, {
  cwd: desktop,
  env: { ...process.env, CARGO_TARGET_DIR: targetDir },
  shell: windows,
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const folder = join(targetDir, target, debug ? "debug" : "release");
const artifact = resolve(folder, `${productName}-v${version}.exe`);
copyFileSync(join(folder, `${productName}.exe`), artifact);
console.log(`\nStandalone executable: ${artifact}`);
