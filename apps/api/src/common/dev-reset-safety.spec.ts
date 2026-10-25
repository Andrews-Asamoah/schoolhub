import { describe, expect, it } from "vitest";
import { getDevResetSafetyError } from "./dev-reset-safety.js";

const local = "postgresql://postgres:postgres@127.0.0.1:5432/schoolhub?schema=public";
const allowed = { allowDevReset: "true", nodeEnv: "development", databaseUrl: local };

describe("development payment reset safety", () => {
  it("requires the exact explicit opt-in, including for a dry run", () => {
    expect(getDevResetSafetyError({ ...allowed, allowDevReset: undefined })).toMatch(/ALLOW_DEV_RESET=true/);
    expect(getDevResetSafetyError({ ...allowed, allowDevReset: "TRUE" })).toMatch(/ALLOW_DEV_RESET=true/);
    expect(getDevResetSafetyError(allowed)).toBeNull();
  });

  it("refuses in production regardless of the opt-in", () => {
    expect(getDevResetSafetyError({ ...allowed, nodeEnv: "production" })).toMatch(/NODE_ENV is production/);
  });

  it("rejects a missing or malformed database URL", () => {
    expect(getDevResetSafetyError({ ...allowed, databaseUrl: undefined })).toMatch(/DATABASE_URL/);
    expect(getDevResetSafetyError({ ...allowed, databaseUrl: "not-a-url" })).toMatch(/valid PostgreSQL/);
    expect(getDevResetSafetyError({ ...allowed, databaseUrl: "https://example.test/db" })).toMatch(/postgres or postgresql/);
  });

  it("allows a generic database name only on a local host", () => {
    expect(getDevResetSafetyError({ ...allowed, databaseUrl: "postgresql://postgres:postgres@localhost:5432/schoolhub" })).toBeNull();
    expect(getDevResetSafetyError({ ...allowed, databaseUrl: "postgresql://postgres:postgres@192.0.2.10:5432/schoolhub" })).toMatch(/local or clearly labelled/);
  });

  it("allows a clearly labelled remote development or test target", () => {
    expect(getDevResetSafetyError({
      ...allowed,
      databaseUrl: "postgresql://postgres:secret@dev-db.example.com:5432/schoolhub",
    })).toBeNull();
    expect(getDevResetSafetyError({
      ...allowed,
      databaseUrl: "postgresql://postgres:secret@db.example.com:5432/schoolhub_test",
    })).toBeNull();
  });

  it("rejects production-labelled targets even if the operator opts in", () => {
    expect(getDevResetSafetyError({
      ...allowed,
      databaseUrl: "postgresql://postgres:secret@prod-db.example.com:5432/schoolhub_dev",
    })).toMatch(/production, live, or primary/);
    expect(getDevResetSafetyError({
      ...allowed,
      databaseUrl: "postgresql://postgres:secret@localhost:5432/schoolhub_prod",
    })).toMatch(/production, live, or primary/);
  });
});
