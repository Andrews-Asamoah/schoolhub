import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, inputClassName } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const controlClassName = inputClassName;

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
        className="block text-xs font-semibold text-foreground"
      >
        {label}
      </label>
      {children}
      {message ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs text-destructive">
          {message}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-[11px] text-muted-foreground">
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
  return <Input className={className} {...props} />;
}

export function FormTextarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Textarea className={className} {...props} />
  );
}

export function FormSelect({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(controlClassName, className)} {...props} />;
}

export function FormSubmitButton({
  children, className, isSubmitting = false, disabled, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { isSubmitting?: boolean }) {
  return (
    <Button {...props} type="submit" loading={isSubmitting} disabled={disabled} className={className}>
      {isSubmitting ? "Saving…" : children}
    </Button>
  );
}

export function FormCancelButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <Button {...props} type="button" variant="outline" className={className} />;
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
