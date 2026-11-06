import { createAuthClient } from "better-auth/react";
import {
  inferAdditionalFields,
  organizationClient,
} from "better-auth/client/plugins";
import { API_ORIGIN, AUTH_BASE_PATH } from "./config";
import { createTokenHooks } from "./auth-token-hooks";
import { getToken, sessionStore } from "./session";

const tokenHooks = createTokenHooks(sessionStore);
export const isCurrentAuthResponse = tokenHooks.isCurrentResponse;

/**
 * The API bearer plugin supplies native session auth. The token arrives in the
 * `set-auth-token` response header and is kept in SecureStore. Native two-factor
 * challenge cookies are not persisted, so accounts requiring a challenge must
 * use the school's web portal.
 */
export const authClient = createAuthClient({
  baseURL: API_ORIGIN,
  basePath: AUTH_BASE_PATH,
  plugins: [
    organizationClient(),
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
