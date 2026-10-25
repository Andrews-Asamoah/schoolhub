import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "4xl";
}

const maxWidthMap = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "4xl": "max-w-4xl",
};

export function PortalModal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = "lg",
}: PortalModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-foreground/50 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="portal-modal-title"
        className={cn(
          "relative z-10 w-full overflow-hidden rounded-2xl border border-border/80 bg-card shadow-2xl transition-all duration-200",
          maxWidthMap[maxWidth],
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-border/60 p-5 sm:p-6">
          <div>
            <h2
              id="portal-modal-title"
              className="text-lg font-bold tracking-tight text-foreground"
            >
              {title}
            </h2>
            {description && (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground/70 transition hover:bg-muted hover:text-foreground/80"
          >
            <X className="size-5" />
            <span className="sr-only">Close modal</span>
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[75vh] overflow-y-auto p-5 sm:p-6">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-border/60 bg-muted/70 p-4 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
