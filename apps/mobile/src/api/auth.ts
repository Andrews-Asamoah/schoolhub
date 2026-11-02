import { z } from "zod";
import { passwordSchema, changePasswordSchema } from "@schoolhub/shared";
import { defineEndpoint } from "./endpoint";
export const schoolCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z0-9][a-z0-9-]{0,62}$/,
    "Enter the school code supplied by your school.",
  );
export const publicSchoolSchema = z.object({
  name: z.string(),
  subdomain: schoolCodeSchema,
  logo: z.string().nullable(),
  primaryColor: z.string().nullable(),
  secondaryColor: z.string().nullable(),
});
export const lookupSchool = defineEndpoint({
  method: "GET",
  path: "/schools/public/:subdomain",
  roles: ["teacher", "student", "guardian"],
  scope: "public",
  response: publicSchoolSchema,
});
export const resolveLogin = defineEndpoint({
  method: "POST",
  path: "/schools/public/:subdomain/resolve-login",
  roles: ["teacher", "student", "guardian"],
  scope: "public",
  request: z.object({ identifier: z.string().trim().min(1).max(120) }),
  response: z.object({ email: z.email() }),
});
export const changePassword = defineEndpoint({
  method: "POST",
  path: "/account/change-password",
  roles: ["teacher", "student", "guardian"],
  scope: "account",
  request: changePasswordSchema,
  response: z.object({ success: z.literal(true) }),
});
export const requestRecovery = defineEndpoint({
  method: "POST",
  path: "/account/password-recovery/request",
  roles: ["teacher", "student", "guardian"],
  scope: "public",
  request: z.object({
    email: z.email().max(254),
    school: schoolCodeSchema.optional(),
  }),
  response: z.object({ success: z.literal(true), message: z.string() }),
});
export const completeRecovery = defineEndpoint({
  method: "POST",
  path: "/account/password-recovery/complete",
  roles: ["teacher", "student", "guardian"],
  scope: "public",
  request: z.object({
    token: z.string().min(20).max(128),
    newPassword: passwordSchema,
  }),
  response: z.object({ success: z.literal(true) }),
});
