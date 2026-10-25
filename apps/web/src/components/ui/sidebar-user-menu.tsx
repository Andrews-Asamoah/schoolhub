import { ChevronRight, ChevronsUpDown, LoaderCircle, LogOut, UserRound } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { UserAvatar } from "@/components/ui/user-avatar";
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

const PANEL_WIDTH = 290;
const GAP = 10;

const itemBase =
  "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-primary/70";

export function SidebarUserMenu({ name, email, image, roleLabel, profileLink }: SidebarUserMenuProps) {
  const { error: signOutError, isSigningOut, logout } = useLogout();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; bottom: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const displayName = name?.trim() || "Your account";

  const place = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const beside = rect.width < 140;
    const width = Math.min(PANEL_WIDTH, window.innerWidth - GAP * 2);
    const left = beside ? rect.right + GAP : rect.left;
    setPosition({
      left: Math.max(GAP, Math.min(left, window.innerWidth - width - GAP)),
      bottom: beside
        ? Math.max(GAP, window.innerHeight - rect.bottom)
        : window.innerHeight - rect.top + GAP,
    });
  };

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
      {/* Trigger Card Button */}
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={displayName}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "group flex w-full min-w-0 items-center gap-2.5 rounded-xl border border-border/60 bg-card/60 p-2 text-left transition-all duration-200 backdrop-blur-md",
          "hover:border-input hover:bg-card/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70",
          "",
          open && "border-input bg-card/90 shadow-sm",
        )}
      >
        <span className="relative shrink-0">
          <UserAvatar name={name} image={image} className="size-9" />
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

      {/* Glassmorphic Popover Card */}
      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label="Account menu"
            style={{
              left: position.left,
              bottom: position.bottom,
              width: Math.min(PANEL_WIDTH, window.innerWidth - GAP * 2),
            }}
            className="user-menu-panel fixed z-[70] overflow-hidden rounded-2xl border border-border/60 bg-card/80 text-left shadow-2xl shadow-foreground/10 ring-1 ring-foreground/5 backdrop-blur-xl animate-in fade-in-0 zoom-in-95"
          >
            {/* Header with Mesh Glass Glow */}
            <div className="relative overflow-hidden px-4 pt-4.5 pb-3.5">
              {/* Subtle ambient gradient mesh */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-x-4 -top-10 h-32 bg-gradient-to-br from-primary/10 via-info/5 to-transparent blur-xl"
              />

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
                onClick: () => close(),
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
                onClick={() => void logout()}
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