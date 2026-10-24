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
      className={`group relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-accent-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}
    >
      {theme === "dark" ? (
        <Sun className="size-4.5 transition-transform duration-300 ease-out group-hover:rotate-45" aria-hidden="true" />
      ) : (
        <Moon className="size-4.5 transition-transform duration-300 ease-out group-hover:-rotate-12" aria-hidden="true" />
      )}
    </button>
  );
}
