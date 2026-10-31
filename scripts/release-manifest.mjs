import fs from "node:fs";
import path from "node:path";

export function assertSha(value) {
  if (!/^[a-f0-9]{40}$/.test(value ?? "")) throw new Error("A full immutable commit SHA is required.");
  return value;
}
export function expectedMigration(root) {
  const directory = path.join(root, "apps/api/prisma/migrations");
  const migrations = fs.readdirSync(directory).filter(name => /^\d{14}_[a-z0-9_]+$/.test(name) && fs.existsSync(path.join(directory, name, "migration.sql"))).sort();
  if (!migrations.length) throw new Error("No migration baseline found.");
  return migrations.at(-1);
}
export function validateManifest(value, repository, sha) {
  assertSha(sha);
  if (value?.schemaVersion !== 1 || value.commit !== sha || value.repository !== repository ||
    !/^\d{14}_[a-z0-9_]+$/.test(value.expectedMigration ?? "")) throw new Error("Release provenance does not match the requested commit.");
  const prefix = `ghcr.io/${repository.split("/")[0].toLowerCase()}/schoolhub-`;
  for (const component of ["api", "web"]) {
    const image = value.images?.[component];
    if (typeof image !== "string" || !image.startsWith(`${prefix}${component}@`) ||
      !/^sha256:[a-f0-9]{64}$/.test(image.slice(`${prefix}${component}@`.length))) throw new Error("Release image must use an approved repository and immutable digest.");
  }
  return value;
}
export function assembleManifest(components, repository, sha, runId, migration) {
  assertSha(sha);
  const images = {};
  for (const part of components) {
    if (!["api", "web"].includes(part.component) || images[part.component] || part.commit !== sha || part.expectedMigration !== migration) throw new Error("Release components are missing, duplicated or from different commits.");
    images[part.component] = part.image;
  }
  return validateManifest({ schemaVersion: 1, repository, commit: sha, expectedMigration: migration, sourceRunId: String(runId),
    createdAt: new Date().toISOString(), images }, repository, sha);
}
