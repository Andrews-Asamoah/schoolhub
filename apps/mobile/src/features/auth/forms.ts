import { useForm } from "@tanstack/react-form";
import { PASSWORD_MAX_LENGTH } from "@schoolhub/shared";
import { z } from "zod";
export const loginSchema = z.object({
  login: z.string().trim().min(1, "Enter your username or email.").max(120),
  password: z.string().min(1, "Enter your password.").max(PASSWORD_MAX_LENGTH),
});
// Phase 3 supplies the verified authentication flow; no endpoint is guessed here.
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
