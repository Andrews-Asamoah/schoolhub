import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
import { invoke } from "@tauri-apps/api/core";
import {
  registerDesktopDevice,
  forgetDesktopSession,
  rememberDesktopSession,
  resumeDesktopSession,
  selectDesktopSchool,
} from "./session";
const native = vi.mocked(invoke);
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});
const response = (status: number, value: unknown) => ({
  status,
  body: Array.from(new TextEncoder().encode(JSON.stringify(value))),
});

describe("native saved sign-in boundary", () => {
  it("sends identifiers and explicit intentions rather than bearer tokens or passwords", async () => {
    native.mockResolvedValue(undefined);
    await selectDesktopSchool("wesley");
    await rememberDesktopSession();
    await forgetDesktopSession("wesley", "teacher@example.test");
    expect(native.mock.calls).toEqual([
      ["desktop_select_school", { school: "wesley" }],
      ["desktop_remember_session"],
      [
        "desktop_forget_session",
        { school: "wesley", address: "teacher@example.test" },
      ],
    ]);
  });
  it("returns only public user data after native validation", async () => {
    native.mockResolvedValue(response(200, { user: { role: "teacher" } }));
    await expect(
      resumeDesktopSession("wesley", "teacher@example.test"),
    ).resolves.toEqual({ role: "teacher" });
  });
  it("does not treat an expired saved session as a successful sign-in", async () => {
    native.mockResolvedValue(response(401, { message: "Sign in again." }));
    await expect(
      resumeDesktopSession("wesley", "teacher@example.test"),
    ).rejects.toThrow("Sign in again.");
  });
  it("surfaces entitlement revocation and update requirements through the existing access screen", async () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });
    native.mockResolvedValue(
      response(403, { error: "DESKTOP_ACCESS_DISABLED", message: "Disabled" }),
    );
    await expect(
      resumeDesktopSession("wesley", "teacher@example.test"),
    ).rejects.toThrow("Disabled");
    expect(dispatchEvent).toHaveBeenCalledOnce();
  });
});

describe("native device registration boundary", () => {
  it("leaves account, installation ID and credentials to native code", async () => {
    native.mockResolvedValue(response(201, { id: "device" }));
    await expect(registerDesktopDevice()).resolves.toBe("device");
    expect(native).toHaveBeenCalledWith("desktop_register_device", { name: "SchoolHub Desktop" });
  });
  it("does not report revoked installations as registered", async () => {
    native.mockResolvedValue(response(403, { error: "SYNC_DEVICE_REVOKED", message: "Installation revoked." }));
    await expect(registerDesktopDevice()).rejects.toThrow("Installation revoked.");
  });
});
