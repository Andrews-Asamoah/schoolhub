import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/error-reporting";

/** Shown for any render error. Reports it and gives the user a retry and a support reference. */
export function ErrorPage({ error, reset }: { error: unknown; reset?: () => void }) {
  const [reference, setReference] = useState<string>();
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    reported.current = true;
    void reportError(error).then(setReference);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center" role="alert">
        <h1 className="text-xl font-bold text-foreground">Something went wrong</h1>
        <p className="text-sm text-muted-foreground">
          This page hit an unexpected error. Your data is safe. Try again, and contact support if it keeps happening.
        </p>
        {reference && <p className="text-xs text-muted-foreground">Support reference: <code>{reference}</code></p>}
        <div className="flex justify-center gap-2">
          <Button onClick={() => (reset ? reset() : window.location.reload())}>Try again</Button>
          <Button variant="outline" onClick={() => window.location.assign("/")}>Go to start</Button>
        </div>
      </div>
    </main>
  );
}

export function NotFoundPage() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <p className="text-sm font-semibold text-muted-foreground">404</p>
        <h1 className="text-xl font-bold text-foreground">Page not found</h1>
        <p className="text-sm text-muted-foreground">The page you are looking for does not exist or has moved.</p>
        <Button asChild><Link to="/">Back to start</Link></Button>
      </div>
    </main>
  );
}
