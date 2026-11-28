import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const configFile = new URL("apps/desktop/src-tauri/tauri.release.conf.json", root);
const version = JSON.parse(readFileSync(new URL("package.json", root), "utf8")).version;
const repository = process.env.GITHUB_REPOSITORY ?? "Andrews-Asamoah/schoolhub";
if (!/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error("Invalid release repository.");
const releases = `https://github.com/${repository}/releases`;

switch (process.argv[2]) {
  case "configure": {
    const key = process.env.SCHOOLHUB_UPDATER_PUBLIC_KEY?.trim();
    if (!key) throw new Error("Set SCHOOLHUB_UPDATER_PUBLIC_KEY to the Tauri public signing key.");
    writeFileSync(configFile, JSON.stringify({
      bundle: { createUpdaterArtifacts: true },
      plugins: { updater: { pubkey: key, endpoints: [`${releases}/latest/download/latest.json`] } },
    }, null, 2) + "\n");
    break;
  }
  case "collect": {
    const bundles = fileURLToPath(new URL("apps/desktop/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/", root));
    const destination = fileURLToPath(new URL("release-desktop/", root));
    const installers = readdirSync(bundles).filter((name) => name.endsWith("-setup.exe"));
    if (installers.length !== 1 || !installers[0].includes(`_${version}_`)) {
      throw new Error("Expected exactly one NSIS installer matching the root version.");
    }
    const [installer] = installers;
    const signature = readFileSync(join(bundles, `${installer}.sig`), "utf8").trim();
    if (!signature) throw new Error("The Windows update signature is empty.");
    mkdirSync(destination, { recursive: true });
    for (const file of [installer, `${installer}.sig`]) {
      copyFileSync(join(bundles, file), join(destination, file));
    }
    writeFileSync(join(destination, "latest.json"), JSON.stringify({
      version,
      pub_date: new Date().toISOString(),
      platforms: {
        "windows-x86_64": {
          signature,
          url: `${releases}/download/v${version}/${encodeURIComponent(installer)}`,
        },
      },
    }, null, 2) + "\n");
    break;
  }
  default:
    throw new Error("Expected configure or collect.");
}
