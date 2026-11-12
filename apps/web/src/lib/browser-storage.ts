/** Browser preferences remain usable when storage is denied or its quota is full.
 * Failed writes/removals override older persisted values for this page lifetime.
 * Never use this storage for authentication tokens or other credentials.
 */
export function createBrowserStorage(kind: "localStorage" | "sessionStorage") {
  const memory = new Map<string, string>();
  const overrides = new Set<string>();
  const native = () => {
    if (typeof window === "undefined") throw new Error("Browser storage unavailable");
    return window[kind];
  };
  return {
    getItem(key: string): string | null {
      if (overrides.has(key)) return memory.get(key) ?? null;
      try {
        const value = native().getItem(key);
        if (value === null) memory.delete(key); else memory.set(key, value);
        return value;
      } catch { return memory.get(key) ?? null; }
    },
    setItem(key: string, value: string): void {
      memory.set(key, value);
      try { native().setItem(key, value); overrides.delete(key); }
      catch { overrides.add(key); }
    },
    removeItem(key: string): void {
      memory.delete(key);
      try { native().removeItem(key); overrides.delete(key); }
      catch { overrides.add(key); }
    },
    keys(): string[] {
      const keys = new Set(memory.keys());
      try {
        const storage = native();
        for (let index = 0; index < storage.length; index++) {
          const key = storage.key(index);
          if (key !== null && !(overrides.has(key) && !memory.has(key))) keys.add(key);
        }
      } catch { /* In-memory keys are sufficient when browser storage is denied. */ }
      return [...keys];
    },
  };
}

export const localPreferences = createBrowserStorage("localStorage");
export const sessionPreferences = createBrowserStorage("sessionStorage");

/** Optional third-party UI may require native storage rather than our fallback. */
export function canUseBrowserStorage(kind: "localStorage" | "sessionStorage"): boolean {
  try {
    if (typeof window === "undefined") return false;
    window[kind].getItem("schoolhub-storage-check");
    return true;
  } catch { return false; }
}
