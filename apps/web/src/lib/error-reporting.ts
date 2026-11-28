type SentryModule = typeof import("@sentry/react");
let sentry: Promise<SentryModule> | null = null;
import { getClientSubdomain } from "./api";

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

/** Keys whose values can hold pupil, parent or finance data and must never leave the browser. */
const SENSITIVE_KEY = /pass|token|secret|cookie|authorization|mark|score|fee|amount|name|email|phone|address|body|dob|birth/i;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, inner]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[redacted]" : scrub(inner, depth + 1),
    ]),
  );
}

/** The SDK is loaded on demand so it never counts against the initial bundle, and only when a DSN is configured. */
export function initErrorReporting() {
  if (!dsn) return;
  sentry = import("@sentry/react");
  void sentry.then((Sentry) => Sentry.init({
    dsn,
    release: import.meta.env.VITE_BUILD_SHA as string | undefined,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    beforeSend(event) {
      event.tags = { ...event.tags, tenant: getClientSubdomain() ?? "none" };
      // Query strings can carry ids and tokens; request bodies and cookies are never sent.
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.url) event.request.url = event.request.url.split("?")[0];
      }
      if (event.extra) event.extra = scrub(event.extra) as typeof event.extra;
      if (event.user) event.user = { id: event.user.id };
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      // Console and click breadcrumbs often contain names typed into forms.
      return breadcrumb.category === "console" || breadcrumb.category?.startsWith("ui.") ? null : breadcrumb;
    },
  }));
}

/** Reports an error and returns the event id shown to the user as a support reference. */
export async function reportError(error: unknown): Promise<string | undefined> {
  if (!sentry) return undefined;
  return (await sentry).captureException(error);
}
