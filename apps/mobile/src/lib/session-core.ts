import { assertMobileRole, mobileRoles, type MobileRole } from "./permissions";

export type SessionStatus =
  | "loading"
  | "signedOut"
  | "needsRoleSelection"
  | "needsPasswordChange"
  | "needsTwoFactorSetup"
  | "subscriptionInactive"
  | "ready";
export type SessionEvent =
  | { type: "unauthorized" }
  | { type: "password-change-required" }
  | { type: "subscription-inactive"; reason: string }
  | { type: "two-factor-required"; audience: string };
export type SessionState = Readonly<{
  status: SessionStatus;
  token: string | null;
  subdomain: string | null;
  roles: readonly MobileRole[];
  activeRole: MobileRole | null;
  rememberedRole: MobileRole | null;
}>;
export type SessionStorage = {
  readToken(): Promise<string | null>;
  writeToken(value: string | null): Promise<void>;
  readContext(): Promise<{ subdomain: string | null; role: string | null }>;
  writeContext(subdomain: string | null, role: string | null): Promise<void>;
};
const initial = (): SessionState => ({
  status: "loading",
  token: null,
  subdomain: null,
  roles: [],
  activeRole: null,
  rememberedRole: null,
});
export function createSessionStore(
  storage: SessionStorage,
  onScopeChange: () => Promise<void> = async () => {},
) {
  let state: SessionState = Object.freeze({
    ...initial(),
    roles: Object.freeze([]),
  });
  let epoch = 0;
  let hydrated = false;
  let hydration: Promise<void> | undefined;
  let writes: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();
  function publish(patch: Partial<SessionState>) {
    state = Object.freeze({
      ...state,
      ...patch,
      roles: Object.freeze([...(patch.roles ?? state.roles)]),
    });
    listeners.forEach((listener) => listener());
  }
  function persist(operation: () => Promise<void>) {
    writes = writes.then(operation, operation);
    return writes;
  }
  const store = {
    getSnapshot: () => state,
    getRevision: () => epoch,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async hydrate() {
      if (hydrated) return;
      if (hydration) return hydration;
      const version = epoch;
      hydration = (async () => {
        try {
          const [token, context] = await Promise.all([
            storage.readToken(),
            storage.readContext(),
          ]);
          if (version !== epoch) return;
          // Disk context never proves membership. A restored token stays loading
          // until a server session and role discovery have both been checked.
          publish({
            token,
            subdomain: context.subdomain,
            rememberedRole: mobileRoles([context.role ?? ""])[0] ?? null,
            status: token ? "loading" : "signedOut",
            activeRole: null,
            roles: [],
          });
          hydrated = true;
        } catch {
          if (version === epoch) {
            publish({ ...initial(), status: "signedOut" });
            hydrated = true;
          }
        } finally {
          hydration = undefined;
        }
      })();
      return hydration;
    },
    async setToken(token: string | null) {
      if (token === state.token) return epoch;
      const version = ++epoch;
      publish({
        token,
        status: token ? "loading" : "signedOut",
        roles: [],
        activeRole: null,
      });
      try {
        await persist(() => storage.writeToken(token));
      } catch {
        await store.clear();
        throw new Error("Unable to save the session securely.");
      }
      return version;
    },
    async setSubdomain(subdomain: string | null) {
      const next = subdomain?.trim().toLowerCase() || null;
      if (next !== state.subdomain && state.token) await store.clear();
      ++epoch;
      publish({ subdomain: next });
      const role = state.activeRole;
      await persist(() => storage.writeContext(next, role));
    },
    async establish(input: {
      token: string;
      subdomain: string;
      roles: readonly string[];
      activeRole?: string | null;
      mustChangePassword?: boolean;
    }) {
      const supported = mobileRoles(input.roles);
      if (!supported.length) {
        await store.clear();
        throw new Error("Use the web portal for this account role.");
      }
      if (!input.token || !input.subdomain.trim())
        throw new Error("A verified session and school context are required.");
      const requested =
        input.activeRole ?? (supported.length === 1 ? supported[0] : null);
      if (requested !== null && requested !== undefined) {
        assertMobileRole(requested);
        if (!supported.includes(requested))
          throw new Error("Role is not assigned to this account.");
      }
      const version = ++epoch;
      publish({ status: "loading", activeRole: null });
      try {
        await onScopeChange();
        if (version !== epoch) return;
        await persist(async () => {
          await storage.writeToken(input.token);
          await storage.writeContext(
            input.subdomain.trim().toLowerCase(),
            requested ?? null,
          );
        });
        if (version !== epoch) return;
        publish({
          token: input.token,
          subdomain: input.subdomain.trim().toLowerCase(),
          roles: supported,
          activeRole: requested ?? null,
          rememberedRole: requested ?? null,
          status: input.mustChangePassword
            ? "needsPasswordChange"
            : requested
              ? "ready"
              : "needsRoleSelection",
        });
      } catch {
        if (version === epoch) await store.clear();
        throw new Error("Unable to save the session securely.");
      }
    },
    async selectRole(role: string | null) {
      assertMobileRole(role);
      if (!state.token || !state.subdomain || !state.roles.includes(role))
        throw new Error("Role is not assigned to this session.");
      if (!["ready", "needsRoleSelection"].includes(state.status))
        throw new Error("Complete the required account steps first.");
      const version = ++epoch;
      const subdomain = state.subdomain;
      publish({ status: "loading", activeRole: null });
      try {
        await onScopeChange();
        if (version !== epoch) return;
        await persist(() => storage.writeContext(subdomain, role));
        if (version === epoch)
          publish({ activeRole: role, rememberedRole: role, status: "ready" });
      } catch {
        if (version === epoch) await store.clear();
        throw new Error("Unable to switch role securely.");
      }
    },
    async clear() {
      ++epoch;
      hydrated = true;
      const subdomain = state.subdomain;
      publish({
        token: null,
        roles: [],
        activeRole: null,
        rememberedRole: null,
        status: "signedOut",
      });
      await Promise.all([
        onScopeChange(),
        persist(async () => {
          await storage.writeToken(null);
          await storage.writeContext(subdomain, null);
        }),
      ]);
    },
    async handleEvent(event: SessionEvent) {
      if (event.type === "unauthorized") return store.clear();
      ++epoch;
      const status = {
        "password-change-required": "needsPasswordChange",
        "two-factor-required": "needsTwoFactorSetup",
        "subscription-inactive": "subscriptionInactive",
      } as const;
      publish({ status: status[event.type] });
      await onScopeChange();
    },
  };
  return store;
}
