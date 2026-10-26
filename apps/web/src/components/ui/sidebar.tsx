import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Slot } from "@radix-ui/react-slot";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const SIDEBAR_STORAGE_KEY = "schoolhub.sidebar.collapsed";
interface SidebarContextValue {
  collapsed: boolean;
  isMobile: boolean;
  mobileOpen: boolean;
  openFlyout: string | null;
  setOpenFlyout: (id: string | null) => void;
  toggle: () => void;
  closeMobile: () => void;
}
const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return typeof window !== "undefined" && window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true"; }
    catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [openFlyout, setOpenFlyout] = useState<string | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => {
      setIsMobile(media.matches);
      if (!media.matches) setMobileOpen(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed)); } catch { /* storage unavailable */ }
  }, [collapsed]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const closeMobile = () => {
    setMobileOpen(false);
    setOpenFlyout(null);
  };
  const toggle = () => {
    setOpenFlyout(null);
    if (isMobile) setMobileOpen((open) => !open);
    else setCollapsed((value) => !value);
  };
  return (
    <SidebarContext.Provider value={{ collapsed, isMobile, mobileOpen, openFlyout, setOpenFlyout, toggle, closeMobile }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("Sidebar components must be used inside SidebarProvider.");
  return context;
}

export function Sidebar({ children, className, ...props }: HTMLAttributes<HTMLElement>) {
  const { collapsed, isMobile, mobileOpen, closeMobile } = useSidebar();
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!isMobile || !mobileOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(asideRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) ?? []).filter(node => !node.hasAttribute("disabled"));
    focusable()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      if (asideRef.current?.contains(document.activeElement)) previousFocus?.focus();
    };
  }, [isMobile, mobileOpen]);
  return (
    <>
      {mobileOpen && <button type="button" aria-label="Close navigation menu" className="fixed inset-0 z-40 bg-overlay backdrop-blur-xs md:hidden" onClick={closeMobile} />}
      <aside
        ref={asideRef}
        data-collapsed={collapsed && !isMobile}
        inert={isMobile && !mobileOpen}
        role={isMobile ? "dialog" : undefined}
        aria-modal={isMobile && mobileOpen ? true : undefined}
        aria-label="Workspace navigation"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[min(17rem,86vw)] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,transform] duration-200 md:sticky md:top-0 md:z-20 md:h-screen md:w-[15.75rem] md:translate-x-0",
          collapsed && "md:w-16",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          className,
        )}
        {...props}
      >
        <button type="button" aria-label="Close navigation" onClick={closeMobile}
          className="absolute right-2 top-4 z-10 inline-flex size-9 items-center justify-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring md:hidden">
          <PanelLeftClose className="size-4" />
        </button>
        {children}
      </aside>
    </>
  );
}

export function SidebarHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex h-[4.5rem] shrink-0 items-center border-b border-sidebar-border pl-3 pr-11 md:pr-3", className)} {...props} />;
}
export function SidebarContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-3 scrollbar-thin", className)} {...props} />;
}
export function SidebarGroup({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={cn("mb-3", className)} {...props} />;
}
export function SidebarGroupLabel({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  const { collapsed, isMobile } = useSidebar();
  if (collapsed && !isMobile) return null;
  return <p className={cn("mb-2 px-2.5 text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground", className)} {...props} />;
}
export function SidebarFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("shrink-0 border-t border-sidebar-border p-2", className)} {...props} />;
}
export function SidebarTrigger({ className, onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { collapsed, isMobile, mobileOpen, toggle } = useSidebar();
  const Icon = isMobile ? (mobileOpen ? PanelLeftClose : PanelLeftOpen) : collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <button
      type="button"
      aria-label={isMobile ? (mobileOpen ? "Close navigation" : "Open navigation") : (collapsed ? "Expand navigation" : "Collapse navigation")}
      aria-expanded={isMobile ? mobileOpen : !collapsed}
      onClick={(event) => { onClick?.(event); if (!event.defaultPrevented) toggle(); }}
      className={cn("inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
      {...props}
    ><Icon className="size-[18px]" /></button>
  );
}

/** Portalled tooltips remain visible even when the sidebar content scrolls or clips. */
export function SidebarTooltip({ label, children, disabled = false }: { label: string; children: ReactNode; disabled?: boolean }) {
  const { collapsed, isMobile } = useSidebar();
  const visible = collapsed && !isMobile && !disabled;
  const ref = useRef<HTMLSpanElement>(null);
  const [show, setShow] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const measure = () => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setPosition({ left: Math.min(window.innerWidth - 130, box.right + 10), top: Math.min(window.innerHeight - 36, Math.max(8, box.top + box.height / 2)) });
  };
  useEffect(() => {
    if (!show || !visible) return;
    measure();
    const close = () => setShow(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [show, visible]);
  return (
    <span
      ref={ref}
      className="block w-full"
      onMouseEnter={() => { if (visible) { measure(); setShow(true); } }}
      onMouseLeave={() => setShow(false)}
      onFocusCapture={() => { if (visible) { measure(); setShow(true); } }}
      onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setShow(false); }}
    >
      {children}
      {visible && show && createPortal(
        <span role="tooltip" style={{ left: position.left, top: position.top, transform: "translateY(-50%)" }}
          className="pointer-events-none fixed z-[90] max-w-56 rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-lg"
        >{label}</span>, document.body)}
    </span>
  );
}

export function SidebarMenuButton({
  active = false, disabled = false, asChild = false, tooltip, flyout = false,
  className, children, onClick, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; asChild?: boolean; tooltip?: string; flyout?: boolean }) {
  const { collapsed, isMobile, closeMobile, setOpenFlyout } = useSidebar();
  const Component = asChild ? Slot : "button";
  const centered = collapsed && !isMobile && !flyout;
  return (
    <SidebarTooltip label={tooltip ?? ""} disabled={!tooltip || flyout}>
      <Component
        {...props}
        {...(!asChild ? { type: "button" as const } : {})}
        aria-label={centered ? tooltip : props["aria-label"]}
        aria-current={active ? "page" : undefined}
        disabled={disabled}
        onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
          onClick?.(event);
          if (!event.defaultPrevented) { closeMobile(); setOpenFlyout(null); }
        }}
        className={cn(
          "group flex min-h-10 w-full min-w-0 items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
          disabled && "cursor-not-allowed opacity-45",
          centered && "md:justify-center md:px-0",
          className,
        )}
      >{children}</Component>
    </SidebarTooltip>
  );
}

/** A single accordion section, with a keyboard-accessible flyout in icon mode. */
export function SidebarNavSection({
  id, label, icon: Icon, active = false, expanded, onToggle, renderItems,
}: {
  id: string; label: string; icon: LucideIcon; active?: boolean;
  expanded: boolean; onToggle: () => void; renderItems: (flyout: boolean) => ReactNode;
}) {
  const { collapsed, isMobile, openFlyout, setOpenFlyout } = useSidebar();
  const compact = collapsed && !isMobile;
  const flyoutOpen = compact && openFlyout === id;
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const subId = useId();
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const measure = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      left: Math.max(8, Math.min(window.innerWidth - 232, rect.right + 9)),
      top: Math.max(8, Math.min(rect.top, window.innerHeight - Math.min(window.innerHeight * 0.7, 448) - 8)),
    });
  };
  useEffect(() => {
    if (!flyoutOpen) return;
    measure();
    // Portalled flyout items must receive focus on keyboard activation too.
    panel.current?.querySelector<HTMLElement>('a[href], button:not([disabled])')?.focus();
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) setOpenFlyout(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpenFlyout(null); trigger.current?.focus(); }
    };
    const onScroll = (event: Event) => {
      // The popup scrolls independently of the sidebar. Scrolling inside it
      // must never dismiss it (including wheel and touch scrolling).
      if (panel.current?.contains(event.target as Node)) return;
      // Scrolls in the background may move the anchor out of alignment.
      setOpenFlyout(null);
    };
    const onResize = () => measure();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [flyoutOpen, setOpenFlyout]);

  return (
    <SidebarGroup>
      <SidebarTooltip label={label} disabled={flyoutOpen}>
        <button ref={trigger} type="button" aria-label={label}
          aria-expanded={compact ? flyoutOpen : expanded}
          aria-controls={compact ? subId + "-flyout" : subId}
          onClick={() => { if (compact) setOpenFlyout(flyoutOpen ? null : id); else onToggle(); }}
          className={cn("group flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
            active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
            compact && "md:justify-center md:px-0")}
        >
          <Icon className="size-[18px] shrink-0" aria-hidden="true" />
          <span className="sidebar-expanded min-w-0 flex-1 truncate">{label}</span>
          <ChevronDown aria-hidden="true" className={cn("sidebar-expanded size-3.5 shrink-0 transition-transform", expanded && "rotate-180")} />
        </button>
      </SidebarTooltip>
      {!compact && (
        <nav id={subId} hidden={!expanded} aria-label={label} className="ml-[18px] mt-1 space-y-0.5 border-l border-sidebar-border pl-2">
          {renderItems(false)}
        </nav>
      )}
      {flyoutOpen && createPortal(
        <div ref={panel} id={subId + "-flyout"} style={position}
          className="fixed z-[80] max-h-[min(70vh,28rem)] w-56 overflow-y-auto overscroll-contain scrollbar-thin rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-xl"
        >
          <p className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <nav aria-label={label} className="space-y-0.5" onClick={() => setOpenFlyout(null)}>{renderItems(true)}</nav>
        </div>, document.body)}
    </SidebarGroup>
  );
}
