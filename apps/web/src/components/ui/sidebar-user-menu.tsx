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
  "group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-blue-500/70";

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
          "group flex w-full min-w-0 items-center gap-2.5 rounded-xl border border-slate-200/60 bg-white/60 p-2 text-left transition-all duration-200 backdrop-blur-md",
          "hover:border-slate-300 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/70",
          "dark:border-slate-800/80 dark:bg-slate-900/50 dark:hover:border-slate-700 dark:hover:bg-slate-800/80",
          open && "border-slate-300 bg-white/90 dark:border-slate-700 dark:bg-slate-800/90 shadow-sm",
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
            className="user-menu-panel fixed z-[70] overflow-hidden rounded-2xl border border-white/60 bg-white/80 text-left shadow-2xl shadow-slate-900/10 ring-1 ring-slate-950/5 backdrop-blur-xl animate-in fade-in-0 zoom-in-95 dark:border-slate-800/80 dark:bg-slate-900/80 dark:shadow-black/60 dark:ring-white/10"
          >
            {/* Header with Mesh Glass Glow */}
            <div className="relative overflow-hidden px-4 pt-4.5 pb-3.5">
              {/* Subtle ambient gradient mesh */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -inset-x-4 -top-10 h-32 bg-gradient-to-br from-indigo-500/10 via-sky-500/5 to-transparent blur-xl dark:from-indigo-400/15 dark:via-purple-500/10"
              />

              <div className="relative flex items-center gap-3.5">
                <UserAvatar
                  name={name}
                  image={image}
                  className="size-12 text-base ring-2 ring-white/90 shadow-sm dark:ring-slate-800"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                    {displayName}
                  </p>
                  {email && (
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400 font-normal">
                      {email}
                    </p>
                  )}
                  {roleLabel && (
                    <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300">
                      <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                      {roleLabel}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Profile Action Link */}
            <div className="border-t border-slate-200/50 p-1.5 dark:border-slate-800/60">
              {profileLink({
                onClick: () => close(),
                className: cn(
                  itemBase,
                  "hover:bg-slate-100/70 focus-visible:bg-slate-100/70 dark:hover:bg-slate-800/60 dark:focus-visible:bg-slate-800/60",
                ),
                children: (
                  <>
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300">
                      <UserRound className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">
                        My profile
                      </span>
                      <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                        View and edit your details
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300" />
                  </>
                ),
              })}
            </div>

            {/* Logout Action Button */}
            <div className="border-t border-slate-200/50 p-1.5 dark:border-slate-800/60">
              <button
                type="button"
                role="menuitem"
                disabled={isSigningOut}
                onClick={() => void logout()}
                className={cn(
                  itemBase,
                  "hover:bg-rose-500/10 focus-visible:bg-rose-500/10 disabled:cursor-wait disabled:opacity-70 dark:hover:bg-rose-500/15 dark:focus-visible:bg-rose-500/15",
                )}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300">
                  {isSigningOut ? <LoaderCircle className="size-4 animate-spin" /> : <LogOut className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-rose-600 dark:text-rose-300">
                    {isSigningOut ? "Signing out…" : "Sign out"}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                    End your session on this device
                  </span>
                </span>
              </button>
              {signOutError && (
                <p role="alert" className="px-3 pt-1 pb-2 text-xs text-rose-600 dark:text-rose-400">
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