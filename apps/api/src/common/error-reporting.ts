import * as Sentry from "@sentry/node";

let enabled = false;

/** Starts error reporting when SENTRY_DSN is set. A no-op otherwise, so local and CI runs are unaffected. */
export function initErrorReporting(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    release: process.env.BUILD_SHA,
    environment: process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0,
    // Request bodies, cookies and headers can hold pupil data and credentials: never send them.
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        delete event.request.headers;
        if (event.request.url) event.request.url = event.request.url.split("?")[0];
        delete event.request.query_string;
      }
      if (event.user) event.user = { id: event.user.id };
      return event;
    },
  });
  enabled = true;
}

/** Reports a server fault with the release, tenant and the reference returned to the caller. */
export function reportServerError(exception: unknown, context: { errorId: string; tenant?: string; route?: string }): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    scope.setTag("errorId", context.errorId);
    if (context.tenant) scope.setTag("tenant", context.tenant);
    if (context.route) scope.setTag("route", context.route);
    Sentry.captureException(exception);
  });
}
