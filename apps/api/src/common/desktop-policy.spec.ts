import { afterEach, describe, expect, it, vi } from "vitest";
import { desktopEntitled, desktopVersionError, desktopOverride, isDesktopRequest, withDesktopOverride } from "./desktop-policy.js";

afterEach(() => vi.unstubAllEnvs());
describe("desktop licensing and identity policy", () => {
  it("uses an explicit boolean school override ahead of the plan and defaults to disabled", () => {
    expect(desktopEntitled(["desktop"], {})).toBe(true);
    expect(desktopEntitled(["desktop"], { desktopEnabled: false })).toBe(false);
    expect(desktopEntitled([], { desktopEnabled: true })).toBe(true);
    expect(desktopEntitled({ desktop: true }, null)).toBe(true);
    for (const settings of [null, {}, { desktopEnabled: "true" }, { desktopEnabled: 1 }]) {
      expect(desktopEntitled(["Desktop app", "attendance"], settings)).toBe(false);
    }
  });
  it("preserves unrelated settings and removes overrides when inheriting", () => {
    const settings = { other: { untouched: true }, desktopEnabled: false };
    expect(withDesktopOverride(settings, true)).toEqual({ other: { untouched: true }, desktopEnabled: true });
    expect(withDesktopOverride(settings, null)).toEqual({ other: { untouched: true } });
    expect(settings.desktopEnabled).toBe(false);
    expect(desktopOverride({ desktopEnabled: "false" })).toBeNull();
  });
  it("cannot turn a persisted desktop session into a browser session by changing headers", () => {
    expect(isDesktopRequest({ session: { session: { clientPlatform: "desktop" } }, headers: { "x-schoolhub-client": "web" } })).toBe(true);
    expect(isDesktopRequest({ headers: { "x-schoolhub-client": "desktop" } })).toBe(true);
    expect(isDesktopRequest({})).toBe(false);
  });
  it("compares complete numeric stable versions and rejects missing or ambiguous versions", () => {
    for (const version of [undefined, "", "latest", "0.0.9", "0.1", "01.1.0", "0.1.0-beta", "0.1.0.1"]) {
      expect(desktopVersionError(version, "0.1.0")).toBeTruthy();
    }
    for (const version of ["0.1.0", "0.1.1", "0.10.0", "1.0.0"]) expect(desktopVersionError(version, "0.1.0")).toBeNull();
    expect(desktopVersionError("0.9.0", "0.10.0")).toBeTruthy();
    expect(() => desktopVersionError("1.0.0", "invalid")).toThrow(/DESKTOP_MIN_VERSION/);
  });
});
