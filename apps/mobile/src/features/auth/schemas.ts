import { z } from "zod";
import {
  passwordSchema,
  changePasswordSchema,
  emailSchema,
} from "@schoolhub/shared";
import { schoolCodeSchema } from "@/api/auth";
export const schoolFormSchema = z.object({ code: schoolCodeSchema });
export const verifySchema = z.object({
  code: z.string().trim().min(1, "Enter a verification code.").max(128),
});
export const setupSchema = z.object({
  password: z.string().min(1, "Enter your current password."),
});
export const passwordFormSchema = changePasswordSchema
  .and(z.object({ confirmPassword: z.string() }))
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords do not match.",
  });
export const recoverySchema = z.object({ email: emailSchema });
export const resetFormSchema = z
  .object({
    token: z
      .string()
      .trim()
      .transform((value) => {
        if (/^https:\/\//i.test(value)) {
          try {
            return new URL(value).searchParams.get("token") ?? value;
          } catch {
            return value;
          }
        }
        return value;
      })
      .pipe(
        z
          .string()
          .min(20, "Enter the reset token or link from your email.")
          .max(128),
      ),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "The passwords do not match.",
  });
