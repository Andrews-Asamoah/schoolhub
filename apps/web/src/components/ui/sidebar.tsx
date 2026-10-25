import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { Slot } from "@radix-ui/react-slot";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarContextValue {
  collapsed: boolean;
  mobileOpen: boolean;
  toggle: () => void;
  closeMobile: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 768px)");
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileOpen(false);
    };

    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);

  const toggle = () => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setMobileOpen((open) => !open);
    } else {
      setCollapsed((isCollapsed) => !isCollapsed);
    }
  };

  return (
    <SidebarContext.Provider
      value={{
        collapsed,
        mobileOpen,
        toggle,
        closeMobile: () => setMobileOpen(false),
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("Sidebar components must be used inside SidebarProvider.");
  }
  return context;
}

export function Sidebar({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement>) {
  const { collapsed, mobileOpen, closeMobile } = useSidebar();

  return (
    <>
      {mobileOpen && (
        <button
          aria-label="Close navigation menu"
          className="fixed inset-0 z-40 bg-foreground/60 backdrop-blur-xs md:hidden"
          onClick={closeMobile}
        />
      )}
      <aside
        data-collapsed={collapsed}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-border bg-card transition-[width,transform] duration-200 md:sticky md:top-0 md:z-20 md:h-screen md:translate-x-0",
          collapsed && "md:w-[5.25rem]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          className,
        )}
        {...props}
      >
        {children}
      </aside>
    </>
  );
}

export function SidebarHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex h-[4.5rem] items-center px-5 border-b border-border/60", className)}
      {...props}
    />
  );
}

export function SidebarContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex-1 overflow-y-auto px-3 py-5 scrollbar-thin", className)}
      {...props}
    />
  );
}

export function SidebarGroup({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <section className={cn("mb-7", className)} {...props} />;
}

export function SidebarGroupLabel({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  const { collapsed } = useSidebar();
  if (collapsed) return null;
  return (
    <p
      className={cn(
        "mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("border-t border-border/60 p-3", className)}
      {...props}
    />
  );
}

export function SidebarTrigger({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { collapsed, toggle } = useSidebar();
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <button
      type="button"
      aria-label="Toggle navigation sidebar"
      onClick={toggle}
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className,
      )}
      {...props}
    >
      <Icon className="size-[18px]" />
    </button>
  );
}

export function SidebarMenuButton({
  active = false,
  disabled = false,
  asChild = false,
  tooltip,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  asChild?: boolean;
  tooltip?: string;
}) {
  const { collapsed, closeMobile } = useSidebar();
  const Component = asChild ? Slot : "button";
  
  // Evaluates tooltip text: explicit tooltip prop -> fallback to children string if collapsed
  const tooltipText = collapsed ? (tooltip ?? (typeof children === "string" ? children : undefined)) : undefined;

  return (
    <Component
      {...(!asChild ? { type: "button" as const } : {})}
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      onClick={closeMobile}
      title={tooltipText}
      className={cn(
        "group flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active
          ? "bg-primary/10 text-primary dark:text-primary"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        disabled && "cursor-not-allowed opacity-45 hover:bg-transparent",
        collapsed && "md:justify-center md:px-0",
        className,
      )}
      {...props}
    >
      {children}
    </Component>
  );
}