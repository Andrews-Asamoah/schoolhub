import { parseSetCookieHeader } from "better-auth/cookies/utils";
import { createTokenHooks } from "./auth-token-hooks";
import { NATIVE_AUTH_ORIGIN } from "./auth-origin";
/** Only the short-lived MFA challenge cookie is retained. Session auth stays bearer-only. */
export function createNativeAuthHooks(
  store: {
    getRevision(): number;
    getSnapshot(): {
      token: string | null;
      subdomain?: string | null;
      activeRole?: string | null;
    };
  },
  tokens: ReturnType<typeof createTokenHooks>,
  write: (value: string | null) => Promise<void>,
) {
  let cookie: string | null = null,
    owner = -1,
    expires = 0,
    writes = Promise.resolve();
  function persist(value: string | null) {
    writes = writes.then(
      () => write(value),
      () => write(value),
    );
    return writes;
  }
  async function clear() {
    cookie = null;
    owner = -1;
    expires = 0;
    await persist(null);
  }
  return {
    clear,
    async onRequest(request: {
      url?: URL | string;
      headers: Headers;
      credentials?: RequestCredentials;
    }) {
      tokens.onRequest(request);
      const revision = store.getRevision();
      request.credentials = "omit";
      request.headers.delete("cookie");
      request.headers.delete("x-academic-year-id");
      request.headers.delete("x-academic-term-id");
      request.headers.set("Origin", NATIVE_AUTH_ORIGIN);
      const current = store.getSnapshot();
      // Sign-out deliberately carries its captured pre-logout credential.
      if (!/\/sign-out(?:\?|$)/.test(String(request.url))) {
        request.headers.delete("authorization");
        if (current.token)
          request.headers.set("Authorization", `Bearer ${current.token}`);
      }
      request.headers.delete("x-school-role");
      request.headers.delete("x-school-subdomain");
      if (current.subdomain)
        request.headers.set("x-school-subdomain", current.subdomain);
      if (
        current.activeRole &&
        ["teacher", "student", "guardian"].includes(current.activeRole)
      )
        request.headers.set("x-school-role", current.activeRole);
      if (owner !== revision || expires <= Date.now()) {
        if (cookie) await clear();
      }
      if (revision !== store.getRevision())
        throw new Error("The sign-in attempt changed. Please try again.");
      if (
        /\/two-factor\/verify-(?:totp|backup-code)(?:\?|$)/.test(
          String(request.url),
        ) &&
        !store.getSnapshot().token
      ) {
        if (!cookie)
          throw new Error(
            "The verification attempt expired. Please sign in again.",
          );
        request.headers.set("Cookie", cookie);
      }
      return;
    },
    async onSuccess(context: Parameters<typeof tokens.onSuccess>[0]) {
      await tokens.onSuccess(context);
      if (!tokens.isCurrentResponse(context.data)) return;
      const data = context.data as { twoFactorRedirect?: boolean };
      if (data.twoFactorRedirect) {
        const raw = context.response.headers.get("set-cookie");
        const parsed = raw ? parseSetCookieHeader(raw) : new Map();
        const challenge = [...parsed.entries()].find(([name]) =>
          /^(?:__Secure-)?better-auth\.two_factor$/.test(name),
        );
        if (!challenge?.[1].value)
          throw new Error(
            "The verification challenge is unavailable. Please sign in again.",
          );
        cookie = `${challenge[0]}=${challenge[1].value}`;
        owner = store.getRevision();
        expires = Date.now() + 5 * 60 * 1000;
        await persist(cookie);
      } else if (
        /\/two-factor\/verify-(?:totp|backup-code)/.test(
          String(context.request.url),
        )
      )
        await clear();
    },
  };
}
