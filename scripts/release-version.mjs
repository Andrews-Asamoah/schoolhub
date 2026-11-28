import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const json = (text) => JSON.parse(text);
const format = (value) => JSON.stringify(value, null, 2) + "\n";
const version = json(read("package.json")).version;
const check = process.argv.includes("--check");

if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version ?? "")) {
  throw new Error("Root package.json needs a stable MAJOR.MINOR.PATCH version.");
}

const tag = process.argv.find((arg) => arg.startsWith("--tag="))?.slice(6);
if (tag !== undefined && tag !== `v${version}`) {
  throw new Error(`Release tag must be v${version} for this commit.`);
}

const mismatched = [];
function update(path, sync) {
  const current = read(path);
  const expected = sync(current);
  if (expected === current) return;
  if (check) mismatched.push(path);
  else writeFileSync(new URL(path, root), expected);
}

const packageVersion = (text) => {
  const pkg = json(text);
  return pkg.version === version ? text : format({ ...pkg, version });
};

update("apps/web/package.json", packageVersion);
update("apps/mobile/app.json", (text) => {
  const app = json(text);
  if (app.expo.version === version) return text;
  app.expo.version = version;
  return format(app);
});
update("apps/desktop/package.json", packageVersion);
update("apps/desktop/src-tauri/tauri.conf.json", packageVersion);

function rustVersion(text, prefix) {
  if (!prefix.test(text)) throw new Error("Could not locate the SchoolHub desktop crate version.");
  return text.replace(prefix, (_, header) => `${header}${version}"`);
}

update("apps/desktop/src-tauri/Cargo.toml", (text) =>
  rustVersion(text, /(\[package\]\r?\nname = "schoolhub-desktop-spike"\r?\nversion = ")[^"]+"/));
update("apps/desktop/src-tauri/Cargo.lock", (text) =>
  rustVersion(text, /(\[\[package\]\]\r?\nname = "schoolhub-desktop-spike"\r?\nversion = ")[^"]+"/));

if (mismatched.length) {
  throw new Error(`Run pnpm version:sync. Out of sync: ${mismatched.join(", ")}`);
}
console.log(`SchoolHub ${version} is synchronized across web, mobile, and desktop.`);
