import { useForm } from "@tanstack/react-form";
import {
  changePasswordSchema,
  PASSWORD_MAX_LENGTH,
  passwordSchema,
} from "@schoolhub/shared";
import { z } from "zod";
import { ApiError, SessionChangedError } from "@/lib/api-error";

export const loginSchema = z.object({
  login: z.string().trim().min(1, "Enter your username or email."),
  password: z.string().min(1, "Enter your password."),
});

export const schoolSubdomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{0,62}$/, "Enter a valid school code.");

export const changePasswordFormSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, "Enter your current password.")
      .max(PASSWORD_MAX_LENGTH),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    path: ["newPassword"],
    message: "Choose a password different from your current one.",
  })
  .refine((value) => value.confirmPassword === value.newPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const passwordRecoveryFormSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email address.")),
});

export const passwordResetFormSchema = z
  .object({
    token: z
      .string()
      .min(20, "Enter the reset token from your email.")
      .max(128),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your new password."),
  })
  .refine((value) => value.confirmPassword === value.newPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export function useSchoolLoginForm(
  submit: (value: z.infer<typeof loginSchema>) => Promise<void>,
) {
  return useForm({
    defaultValues: { login: "", password: "" },
    validators: { onSubmit: loginSchema },
    onSubmit: async ({ value }) => {
      await submit(loginSchema.parse(value));
    },
  });
}

export function useChangePasswordForm(
  submit: (value: z.infer<typeof changePasswordFormSchema>) => Promise<void>,
) {
  return useForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    validators: { onSubmit: changePasswordFormSchema },
    onSubmit: async ({ value }) => {
      await submit(changePasswordFormSchema.parse(value));
    },
  });
}

export function authFailureMessage(
  error: unknown,
  context:
    | "school"
    | "signIn"
    | "recovery"
    | "recoveryComplete"
    | "password"
    | "session",
): string {
  if (error instanceof SessionChangedError)
    return "Your school session changed. Please start again.";
  const status =
    error instanceof ApiError
      ? error.status
      : typeof error === "object" &&
          error !== null &&
          "status" in error &&
          typeof error.status === "number"
        ? error.status
        : undefined;
  if (status === 429)
    return "Too many attempts. Please wait a minute before trying again.";
  if (context === "school" && status === 404)
    return "We couldn't find that school. Check the school code and try again.";
  if (context === "signIn" && [400, 401, 403].includes(status ?? 0))
    return "We couldn't sign you in. Check your username or email and password.";
  if (context === "password" && status === 400)
    return "We couldn't update your password. Check your current password and try again.";
  if (context === "recoveryComplete" && status === 400)
    return "That reset link is invalid or expired. Request a new one.";
  if (status !== undefined && status >= 500)
    return "SchoolHub is temporarily unavailable. Please try again shortly.";
  if (context === "recovery")
    return "We couldn't submit that request. Please try again shortly.";
  return "We couldn't connect. Check your connection and try again.";
}

export function changePasswordRequest(
  value: z.infer<typeof changePasswordFormSchema>,
) {
  return changePasswordSchema.parse(value);
}
