import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer, organization } from "better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordSchema,
} from "@schoolhub/shared";

/** Better Auth endpoints that accept a brand-new password from the client. */
const PASSWORD_SETTING_PATHS = new Set(["/change-password", "/reset-password", "/set-password"]);

export function createAuth(prisma: Parameters<typeof prismaAdapter>[0]) {
  const trustedOrigins = [
    process.env.WEB_ORIGIN ?? "http://localhost:5173",
    "http://localhost:5173",
    "http://*.localhost:5173",
    "http://localhost:3000",
    "http://*.localhost:3000",
    "http://tauri.localhost",
    "tauri://localhost",
    "https://*.schoolhub.gh",
    "https://*.schoolhub.app",
    "https://*.schoolhub.com",
    "https://schoolhub.gh",
  ];

  const cookieDomain = process.env.COOKIE_DOMAIN?.trim();

  return betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      // Accounts are provisioned by school staff only. Without this, anyone
      // could POST /api/auth/sign-up/email and create a free-standing user.
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh once a day
    },
    // Throttle credential-guessing. Better Auth keeps counters in memory by
    // default; switch `storage` to "database" or secondary storage (Redis)
    // when running more than one API instance.
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/change-password": { window: 60, max: 5 },
      },
    },
    // Enforce the same complexity rules on any endpoint that sets a password.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!PASSWORD_SETTING_PATHS.has(ctx.path)) return;
        const candidate = (ctx.body as { newPassword?: unknown } | undefined)?.newPassword;
        const parsed = passwordSchema.safeParse(candidate);
        if (!parsed.success) {
          throw new APIError("BAD_REQUEST", {
            message: parsed.error.issues[0]?.message ?? "Password does not meet requirements",
          });
        }
      }),
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "user",
          input: false,
        },
        // Set by the API when credentials are issued/reset; never writable
        // by the client (input: false) so it cannot be cleared via update-user.
        mustChangePassword: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
      },
    },
    trustedOrigins,
    advanced: {
      useSecureCookies: process.env.NODE_ENV === "production",
      ...(cookieDomain
        ? { crossSubDomainCookies: { enabled: true, domain: cookieDomain } }
        : {}),
    },
    plugins: [
      organization(), // each school = one organization
      bearer(), // token auth for mobile and desktop
    ],
  });
}