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
export const clearTwoFactorChallenge = tokenHooks.clearChallenge;
export const hasTwoFactorChallenge = tokenHooks.hasChallenge;

/**
 * The API bearer plugin supplies native session auth. The token arrives in the
 * `set-auth-token` response header and is kept in SecureStore. The temporary
 * two-factor challenge lives only in memory.
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
