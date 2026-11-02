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
    auth: { type: "Bearer", token: () => getToken() ?? "" },
    onRequest: tokenHooks.onRequest,
    onSuccess: tokenHooks.onSuccess,
  },
});
