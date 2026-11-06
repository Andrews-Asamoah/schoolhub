import { useForm } from "@tanstack/react-form";
import { z } from "zod";

export const messageFieldsSchema = z.object({
  subject: z.string().trim().min(2, "Enter a subject.").max(160),
  body: z.string().trim().min(1, "Enter a message.").max(10_000),
});

export function useMessageFieldsForm(
  submit: (value: z.infer<typeof messageFieldsSchema>) => Promise<void>,
) {
  return useForm({
    defaultValues: { subject: "", body: "" },
    validators: { onSubmit: messageFieldsSchema },
    onSubmit: async ({ value }) => submit(messageFieldsSchema.parse(value)),
  });
}
