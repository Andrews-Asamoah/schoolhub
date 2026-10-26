import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { LoaderCircle } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Shadcn/UI — Button component
 *
 * This is a hand-crafted version of the standard Shadcn Button.
 * You can always regenerate it with: npx shadcn@latest add button
 *
 * Variants: default | destructive | outline | secondary | ghost | link
 * Sizes:    default | sm | lg | icon
 *
 * Usage:
 *   <Button>Save</Button>
 *   <Button variant="outline" size="sm">Cancel</Button>
 *   <Button asChild><Link to="/dashboard">Go</Link></Button>
 */
const buttonVariants = cva(
  // Base styles applied to every button
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90",
        outline:
          "border border-input bg-card text-foreground shadow-xs hover:bg-muted",
        secondary:
          "bg-muted text-foreground shadow-xs hover:bg-muted-foreground/20",
        ghost:
          "hover:bg-muted hover:text-foreground",
        link:
          "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-lg px-6",
        icon: "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * When true, the button renders as its child element.
   * Use with <Link> to make a styled link look like a button:
   *   <Button asChild><Link to="/dashboard">Dashboard</Link></Button>
   */
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
        aria-busy={loading || undefined}
        disabled={!asChild ? disabled || loading : undefined}
      >
        {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
