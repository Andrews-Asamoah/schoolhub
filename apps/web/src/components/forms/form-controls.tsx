import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const controlClassName =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-slate-950 dark:text-white dark:focus:ring-indigo-400/10";

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: unknown;
  className?: string;
  children: ReactNode;
}) {
  const message = getFormErrorMessage(error);

  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-medium text-slate-700 dark:text-slate-300"
      >
        {label}
      </label>
      {children}
      {message ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-rose-700 dark:text-rose-300">
          {message}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-[11px] text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function FormInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlClassName, className)} {...props} />;
}

export function FormTextarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(controlClassName, "resize-y", className)}
      {...props}
    />
  );
}

export function FormSelect({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlClassName, className)} {...props} />;
}

export function FormSubmitButton({
  children,
  className,
  isSubmitting = false,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  isSubmitting?: boolean;
}) {
  return (
    <button
      {...props}
      type="submit"
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-slate-950",
        className,
      )}
      disabled={isSubmitting || disabled}
    >
      {isSubmitting ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        children
      )}
    </button>
  );
}

export function FormCancelButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-lg px-3 text-sm font-medium text-slate-600 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-300 dark:hover:bg-white/[0.06]",
        className,
      )}
      {...props}
    />
  );
}

function getFormErrorMessage(error: unknown): string | undefined {
  if (typeof error === "string") return error;
  if (Array.isArray(error)) {
    for (const item of error) {
      const message = getFormErrorMessage(item);
      if (message) return message;
    }
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return undefined;
}
