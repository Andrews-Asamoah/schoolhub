import {
  changePasswordSchema,
  emailSchema,
  passwordSchema,
} from "@schoolhub/shared";
import { z } from "zod";
import { defineEndpoint } from "./endpoint";

export const publicSchoolSchema = z.object({
  name: z.string(),
  subdomain: z.string(),
  logo: z.string().nullable().optional(),
  primaryColor: z.string().nullable().optional(),
  secondaryColor: z.string().nullable().optional(),
});
export const getPublicSchool = defineEndpoint({
  method: "GET",
  path: "/schools/public/:subdomain",
  roles: [],
  scope: "public",
  response: publicSchoolSchema,
});

export const resolveLoginSchema = z.object({
  identifier: z.string().trim().min(1).max(120),
});
export const resolveLogin = defineEndpoint({
  method: "POST",
  path: "/schools/public/:subdomain/resolve-login",
  roles: [],
  scope: "public",
  request: resolveLoginSchema,
  response: z.object({ email: z.email() }),
});

export const changeOwnPassword = defineEndpoint({
  method: "POST",
  path: "/account/change-password",
  roles: [],
  scope: "session",
  request: changePasswordSchema,
  response: z.object({ success: z.literal(true) }),
});

export const requestPasswordRecovery = defineEndpoint({
  method: "POST",
  path: "/account/password-recovery/request",
  roles: [],
  scope: "public",
  request: z.object({
    email: emailSchema,
    school: z
      .string()
      .regex(/^[a-z0-9][a-z0-9-]{0,62}$/)
      .optional(),
  }),
  response: z.object({ success: z.literal(true), message: z.string() }),
});

export const completePasswordRecovery = defineEndpoint({
  method: "POST",
  path: "/account/password-recovery/complete",
  roles: [],
  scope: "public",
  request: z.object({
    token: z.string().min(20).max(128),
    newPassword: passwordSchema,
  }),
  response: z.object({ success: z.literal(true) }),
});
