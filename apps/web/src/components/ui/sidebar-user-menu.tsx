import { ChevronRight, ChevronsUpDown, LoaderCircle, LogOut, UserRound } from "lucide-react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
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

const PANEL_WIDTH = 288;
const GAP = 8;

const itemBase =
  "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-blue-500/70";

/**
 * Account card at the bottom of a sidebar. Clicking it opens a popover with
 * the signed-in person, a link to their profile and a sign-out action.
 *
 * The popover is portalled to <body> and positioned from the trigger, so it is
 * never clipped by the sidebar (collapsed rail, or the mobile slide-in drawer).
 */
export function SidebarUserMenu({ name, email, image, roleLabel, profileLink }: SidebarUserMenuProps) {
  const { error: signOutError, isSigningOut, logout } = useLogout();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; bottom: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const displayName = name?.trim() || "Your account";

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    // A collapsed sidebar rail is narrow: open beside it instead of above it.
    const beside = rect.width < 140;
    const width = Math.min(PANEL_WIDTH, window.innerWidth - GAP * 2);
    const left = beside ? rect.right + GAP : rect.left;
    setPosition({
      left: Math.max(GAP, Math.min(left, window.innerWidth - width - GAP)),
      bottom: beside
        ? Math.max(GAP, window.innerHeight - rect.bottom)
        : window.innerHeight - rect.top + GAP,
    });
  }, []);

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Keep the panel attached to the trigger.
  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  // Outside click, Escape, and moving focus into the menu.
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
    const frame = requestAnimationFrame(() =>
      panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus(),
    );
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      cancelAnimationFrame(frame);
    };
  }, [open, close]);

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
    );
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (event.key === "ArrowDown") next = (current + 1) % items.length;
    else if (event.key === "ArrowUp") next = (current - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Tab") close();
    if (next !== null) {
      event.preventDefault();
      items[next]?.focus();
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={displayName}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "group flex w-full min-w-0 items-center gap-2.5 rounded-xl border border-transparent p-2 text-left transition",
          "hover:border-slate-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70",
          "dark:hover:border-white/10 dark:hover:bg-white/5",
          open && "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/5",
        )}
      >
        <span className="relative shrink-0">
          <UserAvatar name={name} image={image} className="size-9" />
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900"
          />
        </span>
        <span className="sidebar-expanded min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
            {displayName}
          </span>
          <span className="block truncate text-[10px] text-slate-500 dark:text-slate-400">
            {email ?? roleLabel ?? "Signed in"}
          </span>
        </span>
        <ChevronsUpDown
          aria-hidden="true"
          className="sidebar-expanded size-4 shrink-0 text-slate-400 transition group-hover:text-slate-600 dark:group-hover:text-slate-200"
        />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            id={menuId}
            role="menu"
            aria-label="Account menu"
            onKeyDown={onMenuKeyDown}
            style={{
              left: position.left,
              bottom: position.bottom,
              width: Math.min(PANEL_WIDTH, window.innerWidth - GAP * 2),
              maxHeight: `calc(100vh - ${GAP * 2}px)`,
            }}
            className="user-menu-panel fixed z-[70] overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 text-left shadow-2xl shadow-slate-900/15 ring-1 ring-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/95 dark:shadow-black/50 dark:ring-white/5"
          >
            <div className="relative px-4 pt-4 pb-3">
              <div
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-16 bg-gradient-to-br from-blue-500/15 via-indigo-500/10 to-transparent dark:from-blue-400/15 dark:via-indigo-400/10"
              />
              <div className="relative flex items-center gap-3">
                <UserAvatar
                  name={name}
                  image={image}
                  className="size-12 text-base ring-2 ring-white shadow-sm dark:ring-slate-900"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {displayName}
                  </p>
                  {email && (
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{email}</p>
                  )}
                  {roleLabel && (
                    <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-blue-100 dark:bg-blue-400/10 dark:text-blue-200 dark:ring-blue-300/10">
                      <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                      {roleLabel}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 p-1.5 dark:border-white/10">
              {profileLink({
                onClick: () => close(),
                className: cn(itemBase, "hover:bg-slate-100 focus-visible:bg-slate-100 dark:hover:bg-white/10 dark:focus-visible:bg-white/10"),
                children: (
                  <>
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-200">
                      <UserRound className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">My profile</span>
                      <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                        View and edit your details
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                  </>
                ),
              })}
            </div>

            <div className="border-t border-slate-100 p-1.5 dark:border-white/10">
              <button
                type="button"
                role="menuitem"
                disabled={isSigningOut}
                onClick={() => void logout()}
                className={cn(
                  itemBase,
                  "hover:bg-red-50 focus-visible:bg-red-50 disabled:cursor-wait disabled:opacity-70 dark:hover:bg-red-400/10 dark:focus-visible:bg-red-400/10",
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-300">
                  {isSigningOut ? <LoaderCircle className="size-4 animate-spin" /> : <LogOut className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-red-600 dark:text-red-300">
                    {isSigningOut ? "Signing out…" : "Sign out"}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                    End your session on this device
                  </span>
                </span>
              </button>
              {signOutError && (
                <p role="alert" className="px-3 pt-1 pb-2 text-xs text-red-600 dark:text-red-300">
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
