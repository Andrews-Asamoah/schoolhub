import { createAuthClient } from "better-auth/react";

/**
 * Better Auth client for the web app.
 *
 * Requests use the current web origin and `/api/auth` path. Vite proxies
 * that path to the API during development; production can route it likewise.
 *
 * The `organizationClient` plugin gives us:
 *   - authClient.useActiveOrganization()
 *   - authClient.organization.setActive(id)
 *   - authClient.organization.listMembers()  …etc.
 *
 * The `adminClient` plugin adds `role` to the user type in session data.
 */
import {
  adminClient,
  inferAdditionalFields,
  organizationClient,
  twoFactorClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  basePath: "/api/auth",
  plugins: [
    organizationClient(),
    adminClient(),
    // Authenticator-app (TOTP) sign-in and backup codes. Sign-in returns
    // `twoFactorRedirect: true` instead of a session until the code is verified.
    twoFactorClient(),
    // Server-set flag: true while the password is an admin-issued temporary one.
    inferAdditionalFields({
      user: {
        mustChangePassword: { type: "boolean", required: false },
        twoFactorEnabled: { type: "boolean", required: false },
      },
    }),
  ],
});

// Re-export the hooks so components don't need to import from better-auth directly
export const { useSession, signIn, signOut, signUp } = authClient;
