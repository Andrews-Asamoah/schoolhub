import { Link } from "@tanstack/react-router";
import { UserRoundPen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProfilePhotoControls } from "@/components/school/profile-photo-controls";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useSession } from "@/lib/auth-client";

/**
 * Header account button. Opens a small panel to change your photo, with a
 * link to the full profile page.
 */
export function ProfilePhotoMenu({ subtitle }: { subtitle: string }) {
  const { data: session } = useSession();
  const user = session?.user;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-right transition hover:bg-slate-100 dark:hover:bg-white/10"
      >
        <span className="hidden sm:block">
          <span className="block text-xs font-semibold text-slate-800">{user?.name ?? "School admin"}</span>
          <span className="block text-[10px] text-slate-500">{subtitle}</span>
        </span>
        <UserAvatar name={user?.name} image={user?.image} className="size-9" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Profile photo"
          className="absolute right-0 z-30 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-lg dark:border-white/10 dark:bg-slate-900"
        >
          <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{user?.name}</p>
          <p className="mb-3 truncate text-[11px] text-slate-500">{user?.email}</p>
          <ProfilePhotoControls />
          <Link
            to="/$page"
            params={{ page: "profile" }}
            onClick={() => setOpen(false)}
            className="mt-4 inline-flex items-center gap-1.5 border-t border-slate-100 pt-3 text-[11px] font-semibold text-blue-600 hover:text-blue-700 dark:border-white/10"
          >
            <UserRoundPen className="size-3.5" /> Edit my profile
          </Link>
        </div>
      )}
    </div>
  );
}
