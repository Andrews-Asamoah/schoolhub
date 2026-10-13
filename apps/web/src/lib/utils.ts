import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * cn() — merge Tailwind classes safely.
 *
 * This is the standard Shadcn/UI utility. Combines clsx (conditional classes)
 * with tailwind-merge (resolves conflicts like "p-4 p-6" → "p-6").
 *
 * Usage:
 *   cn("px-4 py-2", isActive && "bg-blue-500", className)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
