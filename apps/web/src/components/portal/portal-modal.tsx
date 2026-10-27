import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface PortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl";
}

const maxWidthMap = {
  sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg",
  xl: "max-w-xl", "2xl": "max-w-2xl", "3xl": "max-w-3xl", "4xl": "max-w-4xl", "5xl": "max-w-5xl",
};

/** Shared accessible modal for school, accountant, teacher and guardian forms. */
export function PortalModal({
  isOpen, onClose, title, description, children, footer, maxWidth = "lg",
}: PortalModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeCallback = useRef(onClose);
  useEffect(() => { closeCallback.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Dismiss the nested calendar or Radix dropdown first, not the form.
        if (event.defaultPrevented || document.querySelector('[role="dialog"][aria-label="Choose a date"]')
          || document.querySelector('[data-radix-select-content]')) return;
        event.preventDefault();
        closeCallback.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = Array.from(contentRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []);
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeys);
    return () => {
      document.removeEventListener("keydown", handleKeys);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [isOpen]);

  if (!isOpen || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-overlay p-3 backdrop-blur-[2px] sm:p-6"
      onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={contentRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          "flex max-h-[calc(100dvh-1.5rem)] w-full min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-2xl sm:max-h-[min(90dvh,56rem)]",
          maxWidthMap[maxWidth],
        )}>
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold leading-tight tracking-tight text-foreground">{title}</h2>
            {description && <p id={descriptionId} className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p>}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close dialog"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <X className="size-[18px]" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-muted/40 px-4 py-4 sm:px-6">{footer}</div>}
      </section>
    </div>,
    document.body,
  );
}
