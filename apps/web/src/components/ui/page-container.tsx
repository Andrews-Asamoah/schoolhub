import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Use the same responsive content measure for school and platform workspaces. */
export const pageContainerClassName = "mx-auto w-full min-w-0 max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 xl:px-9 xl:py-9 2xl:px-11";

export function PageContainer({
  children, className, ...props
}: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return <main className={cn(pageContainerClassName, className)} {...props}>{children}</main>;
}
