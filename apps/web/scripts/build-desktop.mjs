import { spawnSync } from "node:child_process";
const result = spawnSync(
  process.platform === "win32" ? "pnpm.cmd" : "pnpm",
  process.argv.includes("--dev") ? ["exec", "vite"] : ["build"],
  {
    stdio: "inherit",
    env: { ...process.env, VITE_TARGET: "desktop" },
    shell: process.platform === "win32",
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
