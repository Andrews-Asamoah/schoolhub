import { describe, expect, it } from "vitest";
import { desktopAccessIssue } from "./access";

describe("desktop access screen policy", () => {
  it("recognizes auth and controller update errors and license refusals", () => {
    expect(desktopAccessIssue(426, { code: "DESKTOP_UPDATE_REQUIRED", message: "Install 0.2.0" })).toEqual({ kind: "update", message: "Install 0.2.0" });
    expect(desktopAccessIssue(426, null)?.kind).toBe("update");
    expect(desktopAccessIssue(403, { error: "DESKTOP_ACCESS_DISABLED" })?.kind).toBe("license");
  });
  it("leaves ordinary authorization errors and successful responses alone", () => {
    expect(desktopAccessIssue(403, { error: "Forbidden" })).toBeNull();
    expect(desktopAccessIssue(200, {})).toBeNull();
  });
});
