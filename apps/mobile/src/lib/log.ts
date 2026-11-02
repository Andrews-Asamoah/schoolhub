const codes = [
  "session.storage_failed",
  "session.restore_failed",
  "app.unhandled_error",
] as const;
type LogCode = (typeof codes)[number];
/** Free text and payloads can contain names, tokens or passwords. Never emit them. */
export function log(code: LogCode, context?: unknown) {
  if (!(codes as readonly string[]).includes(code)) return;
  console.warn(
    "[SchoolHub]",
    code,
    ...(context === undefined ? [] : ["[redacted]"]),
  );
}
