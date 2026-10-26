import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Semantic status chips that remain legible in both colour schemes. */
export const badgeVariants = cva(
  "inline-flex max-w-full items-center gap-1 rounded-md border px-2.5 py-0.5 text-[11px] font-semibold leading-5 tracking-normal",
  { variants: { variant: {
    default: "border-primary/20 bg-primary/10 text-primary",
    secondary: "border-border bg-muted text-muted-foreground",
    outline: "border-border bg-card text-foreground",
    success: "border-success/20 bg-success/10 text-success",
    warning: "border-warning/20 bg-warning/10 text-warning",
    destructive: "border-destructive/20 bg-destructive/10 text-destructive",
    info: "border-info/20 bg-info/10 text-info",
  } }, defaultVariants: { variant: "secondary" } },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
