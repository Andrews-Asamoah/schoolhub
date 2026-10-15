import { useForm } from "@tanstack/react-form";
import { useEffect } from "react";
import {
  createSupportTicketSchema,
  supportTicketReplySchema,
  updateSupportTicketSchema,
  type CreateSupportTicketInput,
} from "@schoolhub/shared";
import { Check, Send } from "lucide-react";
import type { ReactNode } from "react";
import {
  FormCancelButton,
  FormField,
  FormInput,
  FormSelect,
  FormSubmitButton,
  FormTextarea,
} from "@/components/forms/form-controls";

type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type CreateTicketFormValues = {
  subject: string;
  description: string;
  category: string;
  priority?: TicketPriority;
};

const priorityLabels: Record<TicketPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

const statusLabels: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

const categories = [
  "General",
  "Account access",
  "Students and records",
  "Billing",
  "Technical issue",
  "Feature request",
];

export function CreateTicketForm({
  isSubmitting,
  error,
  onSubmit,
  onCancel,
}: {
  isSubmitting: boolean;
  error: ReactNode;
  onSubmit: (values: CreateSupportTicketInput) => Promise<unknown>;
  onCancel: () => void;
}) {
  const form = useForm({
    defaultValues: {
      subject: "",
      description: "",
      category: "General",
      priority: "MEDIUM" as TicketPriority,
    } as CreateTicketFormValues,
    validators: {
      onBlur: createSupportTicketSchema,
      onSubmit: createSupportTicketSchema,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(createSupportTicketSchema.parse(value));
    },
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit().catch(() => undefined);
      }}
      className="support-create-form rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 shadow-sm dark:border-indigo-300/15 dark:bg-indigo-400/[0.05]"
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-200">
          <Send className="size-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Tell us what’s happening
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            A support specialist will follow up in this thread.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <form.Field name="subject">
          {(field) => (
            <FormField
              label="Subject"
              htmlFor={field.name}
              error={field.state.meta.errors}
            >
              <FormInput
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                className="support-control"
                maxLength={160}
                placeholder="A short summary of the issue"
                aria-invalid={field.state.meta.errors.length > 0}
                aria-describedby={field.state.meta.errors.length > 0 ? `${field.name}-error` : undefined}
              />
            </FormField>
          )}
        </form.Field>
        <form.Field name="category">
          {(field) => (
            <FormField label="Category" htmlFor={field.name}>
              <FormSelect
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                className="support-select"
              >
                {categories.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </FormSelect>
            </FormField>
          )}
        </form.Field>
        <form.Field name="description">
          {(field) => (
            <FormField
              label="Describe the issue"
              htmlFor={field.name}
              className="sm:col-span-2"
              error={field.state.meta.errors}
            >
              <FormTextarea
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                className="support-control"
                rows={4}
                maxLength={10000}
                placeholder="Include what you were doing and what you expected to happen."
                aria-invalid={field.state.meta.errors.length > 0}
                aria-describedby={field.state.meta.errors.length > 0 ? `${field.name}-error` : undefined}
              />
            </FormField>
          )}
        </form.Field>
        <form.Field name="priority">
          {(field) => (
            <FormField label="Priority" htmlFor={field.name}>
              <FormSelect
                id={field.name}
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value as TicketPriority)}
                className="support-select"
              >
                {Object.entries(priorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </FormSelect>
            </FormField>
          )}
        </form.Field>
      </div>
      {error}
      <div className="mt-4 flex justify-end gap-2">
        <FormCancelButton onClick={onCancel}>Cancel</FormCancelButton>
        <FormSubmitButton isSubmitting={isSubmitting}>
          <Send className="size-4" />
          Submit request
        </FormSubmitButton>
      </div>
    </form>
  );
}

export function ReplyForm({
  isSubmitting,
  error,
  onSubmit,
  placeholder,
}: {
  isSubmitting: boolean;
  error: ReactNode;
  onSubmit: (message: string) => Promise<unknown>;
  placeholder: string;
}) {
  const form = useForm({
    defaultValues: { message: "" },
    validators: {
      onBlur: supportTicketReplySchema,
      onSubmit: supportTicketReplySchema,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value.message);
      form.reset();
    },
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit().catch(() => undefined);
      }}
      className="support-reply-form border-t border-slate-100 bg-white p-3 sm:p-4 dark:border-white/10 dark:bg-slate-900"
    >
      <div className="flex items-end gap-2">
        <form.Field name="message">
          {(field) => (
            <FormField
              label="Write a reply"
              htmlFor="ticket-reply"
              className="min-w-0 flex-1"
              error={field.state.meta.errors}
            >
              <FormTextarea
                id="ticket-reply"
                name={field.name}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                maxLength={10000}
                rows={2}
                placeholder={placeholder}
                className="support-reply-textarea min-h-11 resize-y"
                aria-invalid={field.state.meta.errors.length > 0}
                aria-describedby={field.state.meta.errors.length > 0 ? "ticket-reply-error" : undefined}
              />
            </FormField>
          )}
        </form.Field>
        <FormSubmitButton
          aria-label="Send reply"
          isSubmitting={isSubmitting}
          className="size-11 shrink-0 px-0"
        >
          <Send className="size-4" />
        </FormSubmitButton>
      </div>
      {error}
    </form>
  );
}

export function PlatformTicketUpdateForm({
  status,
  priority,
  isSubmitting,
  error,
  successMessage,
  onSubmit,
}: {
  status: TicketStatus;
  priority: TicketPriority;
  isSubmitting: boolean;
  error: ReactNode;
  successMessage: ReactNode;
  onSubmit: (values: { status: TicketStatus; priority: TicketPriority }) => Promise<unknown>;
}) {
  const form = useForm({
    defaultValues: { status, priority } as {
      status: TicketStatus;
      priority?: TicketPriority;
    },
    validators: {
      onSubmit: updateSupportTicketSchema,
    },
    onSubmit: async ({ value }) => {
      const parsed = updateSupportTicketSchema.parse(value);
      await onSubmit({
        status: parsed.status,
        priority: parsed.priority ?? priority,
      });
    },
  });

  useEffect(() => {
    form.reset({ status, priority });
  }, [form, status, priority]);

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit().catch(() => undefined);
      }}
      className="mt-4 flex flex-wrap items-end gap-2"
    >
      <form.Field name="status">
        {(field) => (
          <FormField label="Status" htmlFor="ticket-status">
            <FormSelect
              id="ticket-status"
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value as TicketStatus)}
              className="support-select min-w-36 py-2 text-xs"
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </FormSelect>
          </FormField>
        )}
      </form.Field>
      <form.Field name="priority">
        {(field) => (
          <FormField label="Priority" htmlFor="ticket-priority">
            <FormSelect
              id="ticket-priority"
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value as TicketPriority)}
              className="support-select min-w-28 py-2 text-xs"
            >
              {Object.entries(priorityLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </FormSelect>
          </FormField>
        )}
      </form.Field>
      <FormSubmitButton
        isSubmitting={isSubmitting}
        className="h-9 px-3 text-xs"
      >
        <Check className="size-3.5" />
        Save updates
      </FormSubmitButton>
      {error}
      {successMessage}
    </form>
  );
}

export function CloseTicketForm({
  isSubmitting,
  onSubmit,
}: {
  isSubmitting: boolean;
  onSubmit: () => Promise<unknown>;
}) {
  const form = useForm({
    defaultValues: { status: "CLOSED" as TicketStatus } as {
      status: TicketStatus;
      priority?: TicketPriority;
    },
    validators: {
      onSubmit: updateSupportTicketSchema,
    },
    onSubmit: async ({ value }) => {
      updateSupportTicketSchema.parse(value);
      await onSubmit();
    },
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit().catch(() => undefined);
      }}
      className="mt-3"
    >
      <FormSubmitButton
        isSubmitting={isSubmitting}
        className="border border-emerald-200 bg-emerald-50 text-emerald-800 shadow-none hover:bg-emerald-100 dark:border-emerald-300/20 dark:bg-emerald-400/10 dark:text-emerald-200 dark:hover:bg-emerald-400/15"
      >
        <Check className="size-3.5" />
        Confirm resolution and close
      </FormSubmitButton>
    </form>
  );
}
