import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Use the same responsive content measure for school and platform workspaces. */
export const pageContainerClassName = "mx-auto w-full min-w-0 max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-9";

export function PageContainer({
  children, className, ...props
}: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return <main className={cn(pageContainerClassName, className)} {...props}>{children}</main>;
}
