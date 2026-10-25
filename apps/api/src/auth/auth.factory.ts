import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer, organization, twoFactor } from "better-auth/plugins";
import { APIError, createAuthMiddleware } from "better-auth/api";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordSchema,
} from "@schoolhub/shared";

/** Better Auth endpoints that accept a brand-new password from the client. */
const PASSWORD_SETTING_PATHS = new Set(["/change-password", "/reset-password", "/set-password"]);

/** Platform super-admin sessions are short-lived: re-authenticate every working day. */
const SUPER_ADMIN_SESSION_SECONDS = 60 * 60 * 8;

type PrismaLike = Parameters<typeof prismaAdapter>[0];

/**
 * Plugin endpoints SchoolHub does not use. Switched off so they cannot be
 * probed: get-totp-uri would re-reveal the authenticator secret, and the OTP
 * (email/SMS code) flow is not configured.
 */
const DISABLED_TWO_FACTOR_PATHS = new Set([
  "/two-factor/get-totp-uri",
  "/two-factor/send-otp",
  "/two-factor/verify-otp",
]);

/** Better Auth endpoints that change a user's second-factor setup; each is audited. */
const TWO_FACTOR_AUDITED: Record<string, string> = {
  "/two-factor/disable": "auth.two-factor.disabled",
  "/two-factor/generate-backup-codes": "auth.two-factor.backup-codes-regenerated",
};

/** Subset of the Prisma client used for security audit writes made from auth hooks. */
interface AuditDb {
  auditLog: { create: (args: unknown) => Promise<unknown> };
  member: {
    findFirst: (
      args: unknown,
    ) => Promise<{ organization: { school: { id: string } | null } } | null>;
  };
}

async function recordAuthAudit(
  db: AuditDb,
  entry: { userId: string; entityType: string; ip: string | null; userAgent: string | null },
) {
  const membership = await db.member.findFirst({
    where: { userId: entry.userId },
    select: { organization: { select: { school: { select: { id: true } } } } },
  });
  await db.auditLog.create({
    data: {
      userId: entry.userId,
      schoolId: membership?.organization.school?.id ?? null,
      action: "ACCESS_CHANGED",
      entityType: entry.entityType,
      entityId: entry.userId,
      ipAddress: entry.ip,
      userAgent: entry.userAgent?.slice(0, 300) ?? null,
    },
  });
}

export function createAuth(prisma: PrismaLike) {
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
        // Guessing a 6-digit code must be slow. (A per-account lockout in the
        // plugin backs this up across IP addresses.)
        "/two-factor/verify-totp": { window: 60, max: 5 },
        "/two-factor/verify-backup-code": { window: 60, max: 5 },
        "/two-factor/enable": { window: 60, max: 5 },
        "/two-factor/disable": { window: 60, max: 5 },
        "/two-factor/generate-backup-codes": { window: 60, max: 5 },
      },
    },
    // Enforce the same complexity rules on any endpoint that sets a password.
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (DISABLED_TWO_FACTOR_PATHS.has(ctx.path)) {
          throw new APIError("NOT_FOUND", { message: "Not found" });
        }
        // "Trust this device" skips the second factor for 30 days, which is
        // exactly what we don't want for administrator accounts. Refuse it
        // server-side so a modified client cannot opt in.
        if (
          ctx.path.startsWith("/two-factor/verify") &&
          (ctx.body as { trustDevice?: unknown } | undefined)?.trustDevice
        ) {
          throw new APIError("BAD_REQUEST", {
            message: "Trusting a device is not allowed on SchoolHub.",
          });
        }
        if (!PASSWORD_SETTING_PATHS.has(ctx.path)) return;
        const candidate = (ctx.body as { newPassword?: unknown } | undefined)?.newPassword;
        const parsed = passwordSchema.safeParse(candidate);
        if (!parsed.success) {
          throw new APIError("BAD_REQUEST", {
            message: parsed.error.issues[0]?.message ?? "Password does not meet requirements",
          });
        }
      }),
      // Leave a trail whenever a second factor is switched on, off or reset.
      after: createAuthMiddleware(async (ctx) => {
        const returned = ctx.context.returned;
        if (returned instanceof Error) return; // the request failed; nothing changed

        let entityType = TWO_FACTOR_AUDITED[ctx.path];
        const sessionUser = ctx.context.session?.user as
          | { id: string; twoFactorEnabled?: boolean }
          | undefined;
        // Confirming the first code while signed in completes enrolment.
        // (Verifying at sign-in has no session yet, so it is not matched.)
        if (ctx.path === "/two-factor/verify-totp" && sessionUser && !sessionUser.twoFactorEnabled) {
          entityType = "auth.two-factor.enabled";
        }
        if (!entityType || !sessionUser) return;

        try {
          await recordAuthAudit(prisma as unknown as AuditDb, {
            userId: sessionUser.id,
            entityType,
            ip: ctx.request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
            userAgent: ctx.request?.headers.get("user-agent") ?? null,
          });
        } catch (error) {
          // Never fail a completed security change because its audit write failed.
          console.error("Two-factor audit write failed:", (error as Error).message);
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
        // Exposed on the session so guards can refuse a banned account.
        banned: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
      },
    },
    // Refuse to open a session for a banned account (sign-in, token refresh,
    // anything that creates one) and cap how long a super-admin stays signed in.
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            const account = await (prisma as unknown as {
              user: {
                findUnique: (args: unknown) => Promise<{ banned: boolean; role: string } | null>;
              };
            }).user.findUnique({
              where: { id: session.userId },
              select: { banned: true, role: true },
            });
            if (account?.banned) {
              throw new APIError("FORBIDDEN", { message: "This account has been suspended." });
            }
            if (account?.role === "superAdmin") {
              const cap = new Date(Date.now() + SUPER_ADMIN_SESSION_SECONDS * 1000);
              const expiresAt =
                session.expiresAt && session.expiresAt < cap ? session.expiresAt : cap;
              return { data: { ...session, expiresAt } };
            }
            return { data: session };
          },
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
      twoFactor({
        issuer: process.env.TWO_FACTOR_ISSUER ?? "SchoolHub",
        totpOptions: { digits: 6, period: 30 },
        backupCodeOptions: { amount: 10, length: 10, storeBackupCodes: "encrypted" },
        // Five wrong codes in a row locks the account's second factor for 15
        // minutes, across every device and challenge.
        accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 15 * 60 },
        // The password step must be completed again if the code isn't entered within 5 minutes.
        twoFactorCookieMaxAge: 5 * 60,
      }),
    ],
  });
}