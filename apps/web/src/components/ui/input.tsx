import * as React from "react";
import { cn } from "@/lib/utils";

/** Shared control sizes and focus/error feedback for forms throughout the app. */
export const inputClassName =
  "flex h-11 w-full min-w-0 rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm shadow-foreground/[0.02] outline-none transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60";

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(inputClassName, className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(inputClassName, "h-auto min-h-24 resize-y", className)} {...props} />,
);
Textarea.displayName = "Textarea";
