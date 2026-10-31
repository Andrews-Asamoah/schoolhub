import assert from "node:assert/strict";
import { test } from "node:test";
import { assembleManifest, validateManifest, assertSha } from "./release-manifest.mjs";
const repository = "Andrews-Asamoah/schoolhub";
const sha = "a".repeat(40);
const migration = "20261029000000_private_storage";
const components = ["api", "web"].map(component => ({ component, commit: sha, expectedMigration: migration, image: `ghcr.io/andrews-asamoah/schoolhub-${component}@sha256:${"b".repeat(64)}` }));
test("accepts only complete same-commit digest-pinned release components", () => {
  const manifest = assembleManifest(components, repository, sha, 123, migration);
  assert.equal(manifest.commit, sha); assert.equal(manifest.sourceRunId, "123");
  assert.equal(validateManifest(manifest, repository, sha), manifest);
});
test("rejects mutable refs, mixed commits and duplicate/missing components", () => {
  for (const ref of ["dev", "main", "latest", "a".repeat(7), "a".repeat(40) + "\n"]) assert.throws(() => assertSha(ref));
  assert.throws(() => assembleManifest([components[0]], repository, sha, 123, migration));
  assert.throws(() => assembleManifest([components[0], components[0]], repository, sha, 123, migration));
  assert.throws(() => assembleManifest([components[0], { ...components[1], commit: "c".repeat(40) }], repository, sha, 123, migration));
});
test("rejects substituted image repositories, tags and shell content", () => {
  for (const image of ["ghcr.io/attacker/schoolhub-api@sha256:" + "b".repeat(64), "ghcr.io/andrews-asamoah/schoolhub-api:dev", "image; echo unsafe"]) {
    assert.throws(() => assembleManifest([{ ...components[0], image }, components[1]], repository, sha, 123, migration));
  }
});
