import { ChevronRight, ChevronsUpDown, LoaderCircle, LogOut, UserRound } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { UserAvatar } from "@/components/ui/user-avatar";
import { SidebarTooltip, useSidebar } from "@/components/ui/sidebar";
import { useLogout } from "@/hooks/use-logout";
import { cn } from "@/lib/utils";

export interface SidebarUserMenuProps {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  /** Small badge under the name, e.g. "Administrator". */
  roleLabel?: string;
  /**
   * Renders the "My profile" link. The parent supplies the router <Link> so
   * the destination stays type-checked (school and platform admins differ).
   */
  profileLink: (item: {
    className: string;
    onClick: () => void;
    children: ReactNode;
  }) => ReactNode;
}

const PANEL_WIDTH = 272;
const GAP = 10;

const itemBase =
  "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-primary/70";

export function SidebarUserMenu({ name, email, image, roleLabel, profileLink }: SidebarUserMenuProps) {
  const { error: signOutError, isSigningOut, logout } = useLogout();
  const { collapsed, isMobile, closeMobile } = useSidebar();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; bottom: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const displayName = name?.trim() || "Your account";

  const place = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const beside = collapsed && !isMobile;
    const width = Math.min(PANEL_WIDTH, window.innerWidth - GAP * 2);
    const left = beside ? rect.right + GAP : rect.left;
    setPosition({
      left: Math.max(GAP, Math.min(left, window.innerWidth - width - GAP)),
      bottom: Math.max(GAP, Math.min(window.innerHeight - 220, beside ? window.innerHeight - rect.bottom : window.innerHeight - rect.top + GAP)),
    });
  };

  // The panel is rendered in a portal. Focus its first action on keyboard opening.
  useEffect(() => {
    if (open && position && document.activeElement === triggerRef.current) {
      panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }
  }, [open, position]);

  const close = (returnFocus = false) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    place();
    const handleResizeOrScroll = () => place();
    window.addEventListener("resize", handleResizeOrScroll);
    window.addEventListener("scroll", handleResizeOrScroll, true);
    return () => {
      window.removeEventListener("resize", handleResizeOrScroll);
      window.removeEventListener("scroll", handleResizeOrScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      {/* The account trigger is compact in icon mode; the portal menu stays full width. */}
      <SidebarTooltip label="Account & profile" disabled={open}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${displayName}`}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "group flex w-full min-w-0 items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/30 p-1.5 text-left transition-colors",
          "hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          collapsed && !isMobile && "md:justify-center md:p-1.5",

          open && "bg-sidebar-accent shadow-sm",
        )}
      >
        <span className="relative shrink-0">
          <UserAvatar name={name} image={image} className="size-8" />
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-success ring-2 ring-background"
          />
        </span>
        <span className="sidebar-expanded min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-foreground">
            {displayName}
          </span>
          <span className="block truncate text-[10px] text-muted-foreground">
            {email ?? roleLabel ?? "Signed in"}
          </span>
        </span>
        <ChevronsUpDown
          aria-hidden="true"
          className="sidebar-expanded size-4 shrink-0 text-muted-foreground/70 transition group-hover:text-muted-foreground"
        />
      </button>
      </SidebarTooltip>

      {/* Accessible account dropdown anchored above or beside the trigger. */}
      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label="Account menu"
            onKeyDown={(event) => {
              const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
              if (!items.length) return;
              const index = items.indexOf(document.activeElement as HTMLElement);
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const delta = event.key === "ArrowDown" ? 1 : -1;
                items[(index + delta + items.length) % items.length]?.focus();
              } else if (event.key === "Home" || event.key === "End") {
                event.preventDefault();
                items[event.key === "Home" ? 0 : items.length - 1]?.focus();
              }
            }}
            style={{
              left: position.left,
              bottom: position.bottom,
              width: Math.min(PANEL_WIDTH, window.innerWidth - GAP * 2),
            }}
            className="user-menu-panel fixed z-[70] overflow-hidden rounded-xl border border-border bg-popover text-left text-popover-foreground shadow-xl"
          >
            {/* Current account */}
            <div className="relative overflow-hidden px-4 pt-4.5 pb-3.5">

              <div className="relative flex items-center gap-3.5">
                <UserAvatar
                  name={name}
                  image={image}
                  className="size-12 text-base ring-2 ring-background/90 shadow-sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold tracking-tight text-foreground">
                    {displayName}
                  </p>
                  {email && (
                    <p className="truncate text-xs text-muted-foreground font-normal">
                      {email}
                    </p>
                  )}
                  {roleLabel && (
                    <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-semibold text-primary">
                      <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                      {roleLabel}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Profile Action Link */}
            <div className="border-t border-border/50 p-1.5">
              {profileLink({
                onClick: () => { close(); closeMobile(); },
                className: cn(
                  itemBase,
                  "hover:bg-muted/70 focus-visible:bg-muted/70",
                ),
                children: (
                  <>
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <UserRound className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-foreground">
                        My profile
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        View and edit your details
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/70 transition group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                  </>
                ),
              })}
            </div>

            {/* Logout Action Button */}
            <div className="border-t border-border/50 p-1.5">
              <button
                type="button"
                role="menuitem"
                disabled={isSigningOut}
                onClick={() => { closeMobile(); void logout(); }}
                className={cn(
                  itemBase,
                  "hover:bg-destructive/10 focus-visible:bg-destructive/10 disabled:cursor-wait disabled:opacity-70",
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                  {isSigningOut ? <LoaderCircle className="size-4 animate-spin" /> : <LogOut className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-destructive">
                    {isSigningOut ? "Signing out…" : "Sign out"}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    End your session on this device
                  </span>
                </span>
              </button>
              {signOutError && (
                <p role="alert" className="px-3 pt-1 pb-2 text-xs text-destructive">
                  {signOutError}
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}