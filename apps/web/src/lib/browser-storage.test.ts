import { afterEach, describe, expect, it, vi } from "vitest";
import { canUseBrowserStorage, createBrowserStorage, localPreferences, sessionPreferences } from "./browser-storage";

import { clearPrivateSessionPreferences } from "./private-session";

afterEach(() => vi.unstubAllGlobals());
function persistedStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}
describe("browser preference storage", () => {
  it("clears private fallback state during logout without requiring native storage", () => {
    vi.stubGlobal("window", {
      get localStorage() { throw new Error("SecurityError"); },
      get sessionStorage() { throw new Error("SecurityError"); },
    });
    localPreferences.setItem("schoolhub-active-role", "guardian");
    sessionPreferences.setItem("schoolhub-ward:user", "ward-1");
    sessionPreferences.setItem("schoolhub-draft:sheet", "draft");
    sessionPreferences.setItem("schoolhub-accountant-academic-view", "period");
    clearPrivateSessionPreferences();
    expect(localPreferences.getItem("schoolhub-active-role")).toBeNull();
    expect(sessionPreferences.keys()).toEqual([]);
  });
  it("supports reads, selection changes and cleanup when even the storage getter throws", () => {
    vi.stubGlobal("window", { get localStorage() { throw new Error("SecurityError"); } });
    const storage = createBrowserStorage("localStorage");
    expect(canUseBrowserStorage("localStorage")).toBe(false);
    expect(storage.getItem("role")).toBeNull();
    storage.setItem("role", "teacher");
    expect(storage.getItem("role")).toBe("teacher");
    expect(storage.keys()).toEqual(["role"]);
    storage.removeItem("role");
    expect(storage.getItem("role")).toBeNull();
    expect(storage.keys()).toEqual([]);
  });
  it("uses updated in-memory values when quota errors leave an older persisted value behind", () => {
    const native = persistedStorage({ role: "admin" });
    vi.stubGlobal("window", { localStorage: native });
    const storage = createBrowserStorage("localStorage");
    expect(storage.getItem("role")).toBe("admin");
    native.setItem = () => { throw new Error("QuotaExceededError"); };
    storage.setItem("role", "teacher");
    expect(storage.getItem("role")).toBe("teacher");
    expect(native.getItem("role")).toBe("admin");
    native.removeItem = () => { throw new Error("SecurityError"); };
    storage.removeItem("role");
    expect(storage.getItem("role")).toBeNull();
    expect(storage.keys()).toEqual([]);
  });
  it("sees cross-tab changes in available native storage and enumerates persisted keys for logout", () => {
    const native = persistedStorage({ "schoolhub-draft:sheet": "draft" });
    vi.stubGlobal("window", { sessionStorage: native });
    const storage = createBrowserStorage("sessionStorage");
    expect(storage.keys()).toEqual(["schoolhub-draft:sheet"]);
    native.setItem("ward", "a");
    expect(storage.getItem("ward")).toBe("a");
    native.setItem("ward", "b");
    expect(storage.getItem("ward")).toBe("b");
    for (const key of storage.keys()) storage.removeItem(key);
    expect(native.length).toBe(0);
  });
});
