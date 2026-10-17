import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer, organization } from "better-auth/plugins";

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
    emailAndPassword: { enabled: true },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "user",
          input: false,
        },
      },
    },
    trustedOrigins,
    advanced: cookieDomain
      ? {
          crossSubDomainCookies: {
            enabled: true,
            domain: cookieDomain,
          },
        }
      : undefined,
    plugins: [
      organization(), // each school = one organization
      bearer(), // token auth for mobile and desktop
    ],
  });
}