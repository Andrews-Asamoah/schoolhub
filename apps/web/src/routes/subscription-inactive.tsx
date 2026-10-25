import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { Check, CircleAlert, LoaderCircle, LogOut, PauseCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ThemeToggle } from "@/components/school/theme-toggle";
import { apiFetch } from "@/lib/api";
import { signOut } from "@/lib/auth-client";

interface Search {
  reason?: string;
}

export const Route = createFileRoute("/subscription-inactive")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    reason: typeof search.reason === "string" ? search.reason : undefined,
  }),
  component: SubscriptionInactivePage,
});

const COPY: Record<string, { title: string; body: string }> = {
  SUSPENDED: {
    title: "This school’s account is suspended",
    body: "Access has been paused by the SchoolHub team. Your data is safe and nothing has been deleted.",
  },
  CANCELLED: {
    title: "This school’s subscription was cancelled",
    body: "Your data is kept safe. Contact SchoolHub to reactivate the school.",
  },
  EXPIRED: {
    title: "This school’s subscription has expired",
    body: "Renew the subscription to restore access for staff, students and guardians. Nothing has been deleted.",
  },
};

function SubscriptionInactivePage() {
  const { reason } = Route.useSearch();
  const copy = COPY[reason ?? ""] ?? COPY.EXPIRED!;
  const [subject, setSubject] = useState("Please restore our school’s access");
  const [message, setMessage] = useState("");

  const ticket = useMutation({
    mutationFn: () =>
      apiFetch("/support/tickets", {
        method: "POST",
        body: JSON.stringify({ subject, description: message, category: "Billing", priority: "HIGH" }),
      }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    ticket.mutate();
  }

  const field = "w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="absolute right-5 top-5"><ThemeToggle /></div>
      <div className="w-full max-w-lg">
        <div className="rounded-3xl border border-border bg-card p-7 shadow-xl sm:p-9">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-warning/10 text-warning">
            <PauseCircle className="size-6" />
          </span>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-foreground">{copy.title}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.body}</p>

          {ticket.isSuccess ? (
            <p role="status" className="mt-6 flex items-start gap-2 rounded-xl border border-success/25 bg-success/10 px-4 py-3 text-sm text-success">
              <Check className="mt-0.5 size-4 shrink-0" /> Thanks. Your request has reached the SchoolHub team and they will reply by email.
            </p>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-3">
              <h2 className="text-sm font-bold text-foreground">Contact SchoolHub</h2>
              <p className="text-xs text-muted-foreground">Only school owners and administrators can send this request.</p>
              <label className="block">
                <span className="sr-only">Subject</span>
                <input value={subject} onChange={(event) => setSubject(event.target.value)} minLength={5} maxLength={160} required className={field} />
              </label>
              <label className="block">
                <span className="sr-only">Message</span>
                <textarea value={message} onChange={(event) => setMessage(event.target.value)} minLength={10} maxLength={10000} required rows={4} placeholder="Tell us what you need, e.g. payment reference or renewal date." className={`${field} resize-none`} />
              </label>
              {ticket.error && (
                <p role="alert" className="flex items-start gap-2 text-xs font-medium text-destructive">
                  <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
                  {ticket.error.message || "We couldn’t send your request."}
                </p>
              )}
              <button type="submit" disabled={ticket.isPending} className="superadmin-button-primary inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60">
                {ticket.isPending && <LoaderCircle className="size-4 animate-spin" />} Send request
              </button>
            </form>
          )}

          <button type="button" onClick={() => void signOut().then(() => window.location.assign("/login"))} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
