import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
      aria-pressed={theme === "dark"}
      onClick={toggleTheme}
      className={`group relative flex size-9 items-center justify-center rounded-lg text-slate-500 transition-all duration-200 hover:bg-slate-100 hover:text-slate-900 active:scale-95 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/80 dark:focus-visible:ring-blue-400/80 ${className}`}
    >
      {theme === "dark" ? (
        <Sun className="size-4.5 transition-transform duration-300 ease-out group-hover:rotate-45" aria-hidden="true" />
      ) : (
        <Moon className="size-4.5 transition-transform duration-300 ease-out group-hover:-rotate-12" aria-hidden="true" />
      )}
    </button>
  );
}
