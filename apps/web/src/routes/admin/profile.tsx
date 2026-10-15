import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/lib/auth-client";
import { Mail, ShieldCheck, UserCircle } from "lucide-react";

export const Route = createFileRoute("/admin/profile")({
  component: SuperAdminProfilePage,
});

function SuperAdminProfilePage() {
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">Personal</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">My profile</h1>
        <p className="mt-1 text-sm text-slate-500">Your platform administrator account details.</p>
      </header>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-4 bg-gradient-to-r from-indigo-950 to-blue-800 p-6 text-white sm:p-8">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <UserCircle className="size-8" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold">{user?.name ?? "Super Admin"}</h2>
            <p className="mt-1 text-sm text-indigo-100">SchoolHub platform administrator</p>
          </div>
        </div>
        <dl className="divide-y divide-slate-100">
          <div className="flex items-center gap-4 px-6 py-5">
            <Mail className="size-4 text-slate-400" />
            <div>
              <dt className="text-xs font-medium text-slate-500">Email address</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-800">{user?.email ?? "—"}</dd>
            </div>
          </div>
          <div className="flex items-center gap-4 px-6 py-5">
            <ShieldCheck className="size-4 text-slate-400" />
            <div>
              <dt className="text-xs font-medium text-slate-500">Platform role</dt>
              <dd className="mt-1 text-sm font-semibold text-slate-800">{user?.role ?? "—"}</dd>
            </div>
          </div>
        </dl>
      </section>
      <p className="text-xs leading-5 text-slate-500">
        Profile editing and password management are not available in the platform console yet.
        Use the sign-out control before ending a shared session.
      </p>
    </div>
  );
}
