import { Link } from "@tanstack/react-router";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useSession } from "@/lib/auth-client";

/**
 * Header shortcut to the signed-in user's profile page. Sign-out and the
 * account card live in the sidebar user menu; photo changes happen on the
 * profile page, so this stays a plain link.
 */
export function HeaderAccountLink({ subtitle }: { subtitle: string }) {
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <Link
      to="/$page"
      params={{ page: "profile" }}
      aria-label="My profile"
      className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-right transition hover:bg-slate-100 dark:hover:bg-white/10"
    >
      <span className="hidden sm:block">
        <span className="block text-xs font-semibold text-slate-800">{user?.name ?? "School admin"}</span>
        <span className="block text-[10px] text-slate-500">{subtitle}</span>
      </span>
      <UserAvatar name={user?.name} image={user?.image} className="size-9" />
    </Link>
  );
}
