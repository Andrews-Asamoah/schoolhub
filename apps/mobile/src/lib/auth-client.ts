import { SessionChangedError } from "./api-error";
import { log } from "./log";
import * as SecureStore from "expo-secure-store";
import { createNativeAuthHooks } from "./native-auth";
import { createAuthClient } from "better-auth/react";
import {
  inferAdditionalFields,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";
import { API_ORIGIN, AUTH_BASE_PATH } from "./config";
import { createTokenHooks } from "./auth-token-hooks";
import { getToken, sessionStore } from "./session";

const tokenHooks = createTokenHooks(sessionStore);
const nativeHooks = createNativeAuthHooks(
  sessionStore,
  tokenHooks,
  async (value) => {
    if (value) await SecureStore.setItemAsync("schoolhub.mfa-challenge", value);
    else await SecureStore.deleteItemAsync("schoolhub.mfa-challenge");
  },
);
export const clearAuthChallenge = nativeHooks.clear;
void clearAuthChallenge().catch(() => log("session.storage_failed"));
let lastRevision = sessionStore.getRevision();
sessionStore.subscribe(() => {
  const revision = sessionStore.getRevision();
  if (revision !== lastRevision) {
    lastRevision = revision;
    void clearAuthChallenge().catch(() => {});
  }
});
export const isCurrentAuthResponse = tokenHooks.isCurrentResponse;

/**
 * Better Auth client for native.
 *
 * The API already registers the bearer() plugin, so native clients authenticate
 * with `Authorization: Bearer <token>` and never use cookies. That also avoids
 * Better Auth's cookie-based origin (CSRF) check, which native requests (no
 * Origin header) would otherwise fail. The token arrives in the `set-auth-token`
 * response header on sign-in and is kept in expo-secure-store.
 */
export const authClient = createAuthClient({
  baseURL: API_ORIGIN,
  basePath: AUTH_BASE_PATH,
  plugins: [
    organizationClient(),
    twoFactorClient(),
    inferAdditionalFields({
      user: {
        mustChangePassword: { type: "boolean", required: false },
        twoFactorEnabled: { type: "boolean", required: false },
      },
    }),
  ],
  fetchOptions: {
    timeout: 20000,
    auth: { type: "Bearer", token: () => getToken() ?? "" },
    onRequest: nativeHooks.onRequest,
    onSuccess: nativeHooks.onSuccess,
  },
});

/** Bind UI intent to the generation that initiated it, before async fetch plugins run. */
export function guardedAuthOptions(revision: number) {
  return {
    onRequest: async (request: Parameters<typeof nativeHooks.onRequest>[0]) => {
      if (sessionStore.getRevision() !== revision)
        throw new SessionChangedError();
      await nativeHooks.onRequest(request);
    },
  };
}
