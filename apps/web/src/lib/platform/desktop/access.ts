export const DESKTOP_ACCESS_EVENT = "schoolhub:desktop-access";
export type DesktopAccessIssue = { kind: "update" | "license"; message: string };
export function desktopAccessIssue(status: number, payload: unknown): DesktopAccessIssue | null {
  const data = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const code = data.error ?? data.code;
  if (status === 426) return { kind: "update", message: typeof data.message === "string" ? data.message : "Update SchoolHub Desktop to continue." };
  if (status === 403 && code === "DESKTOP_ACCESS_DISABLED") return { kind: "license", message: typeof data.message === "string" ? data.message : "Desktop access is not enabled for this school." };
  return null;
}
