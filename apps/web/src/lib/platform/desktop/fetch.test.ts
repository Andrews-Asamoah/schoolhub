import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
import { invoke } from "@tauri-apps/api/core";
import { desktopFetch } from "./fetch";

const native = vi.mocked(invoke);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
function setup() {
  vi.stubGlobal("window", { location: { origin: "http://tauri.localhost" } });
  native.mockResolvedValue({
    status: 200,
    headers: { "content-type": "application/json" },
    body: [123, 125],
  });
}

describe("desktop native transport", () => {
  it("passes a relative API path and binary bytes through IPC", async () => {
    setup();
    const response = await desktopFetch("/api/attendance", {
      method: "POST",
      body: "{}",
    });
    expect(await response.json()).toEqual({});
    expect(native).toHaveBeenCalledWith("desktop_request", {
      request: expect.objectContaining({
        path: "/api/attendance",
        method: "POST",
        body: [123, 125],
      }),
    });
  });
  it("refuses foreign origins and non-API paths before calling native code", async () => {
    setup();
    await expect(
      desktopFetch("https://evil.example/api/students"),
    ).rejects.toThrow("SchoolHub API");
    await expect(desktopFetch("/admin/schools")).rejects.toThrow(
      "SchoolHub API",
    );
    expect(native).not.toHaveBeenCalled();
  });
  it("does not deliver an IPC response after cancellation", async () => {
    setup();
    const abort = new AbortController();
    native.mockImplementation(async () => {
      abort.abort();
      return { status: 200, headers: {}, body: [] };
    });
    await expect(
      desktopFetch("/api/students", { signal: abort.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("serializes multipart bodies with their boundary and preserves binary response bytes", async () => {
    setup();
    const body = new FormData();
    body.append(
      "file",
      new Blob([new Uint8Array([0, 255, 128])]),
      "synthetic.bin",
    );
    native.mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/octet-stream" },
      body: [0, 255, 128],
    });
    const result = await desktopFetch("/api/documents", {
      method: "POST",
      body,
    });
    expect(Array.from(new Uint8Array(await result.arrayBuffer()))).toEqual([
      0, 255, 128,
    ]);
    const args = native.mock.calls[0]?.[1] as {
      request: { headers: Record<string, string>; body: number[] };
    };
    expect(args.request.headers["content-type"]).toContain(
      "multipart/form-data; boundary=",
    );
    expect(args.request.body).toContain(255);
  });
});

it("reports local-only logout so the normal successful logout can clear private UI caches", async () => {
  setup();
  const dispatchEvent = vi.fn();
  vi.stubGlobal("window", { dispatchEvent });
  native.mockResolvedValue({ status: 200, headers: { "x-schoolhub-local-logout": "true" }, body: [123, 125] });
  const response = await desktopFetch("/api/auth/sign-out", { method: "POST" });
  expect(response.status).toBe(200);
  expect(dispatchEvent).toHaveBeenCalledOnce();
});
