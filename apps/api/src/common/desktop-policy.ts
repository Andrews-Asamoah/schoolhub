import { DESKTOP_PLAN_FEATURE } from "@schoolhub/shared";
import { ForbiddenException, HttpException } from "@nestjs/common";

export const DESKTOP_FEATURE = DESKTOP_PLAN_FEATURE;
export const DESKTOP_ACCESS_DISABLED = "DESKTOP_ACCESS_DISABLED";
export const DESKTOP_UPDATE_REQUIRED = "DESKTOP_UPDATE_REQUIRED";
const VERSION = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/;

type DesktopRequest = {
  headers?: Record<string, unknown>;
  session?: { session?: { clientPlatform?: unknown } };
};
export function isDesktopRequest(request: DesktopRequest): boolean {
  return request.session?.session?.clientPlatform === "desktop" ||
    request.headers?.["x-schoolhub-client"] === "desktop";
}
export function desktopVersionError(version: unknown, minimum = process.env.DESKTOP_MIN_VERSION ?? "0.1.0"): string | null {
  if (!VERSION.test(minimum)) throw new Error("DESKTOP_MIN_VERSION must be a stable major.minor.patch version.");
  if (typeof version !== "string" || !VERSION.test(version)) return `Update SchoolHub Desktop to version ${minimum} or later.`;
  const actual = version.split(".").map(Number);
  const required = minimum.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    if (actual[index]! > required[index]!) return null;
    if (actual[index]! < required[index]!) return `Update SchoolHub Desktop to version ${minimum} or later.`;
  }
  return null;
}
export function assertDesktopVersion(request: DesktopRequest): void {
  if (!isDesktopRequest(request)) return;
  const message = desktopVersionError(request.headers?.["x-schoolhub-client-version"]);
  if (message) throw new HttpException({ message, error: DESKTOP_UPDATE_REQUIRED }, 426);
}
export function assertDesktopSchoolRole(request: DesktopRequest, role: unknown): void {
  if (isDesktopRequest(request) && role === "superAdmin") {
    throw new ForbiddenException({ error: "DESKTOP_SUPERADMIN_FORBIDDEN", message: "Platform administrators must use the web portal." });
  }
}
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function desktopOverride(settings: unknown): boolean | null {
  const value = record(settings).desktopEnabled;
  return typeof value === "boolean" ? value : null;
}
export function desktopEntitled(features: unknown, settings: unknown): boolean {
  const override = desktopOverride(settings);
  if (override !== null) return override;
  // Support legacy object-shaped feature data as well as current plan lists.
  return Array.isArray(features) ? features.includes(DESKTOP_FEATURE) : record(features).desktop === true;
}
export function withDesktopOverride(settings: unknown, enabled: boolean | null): Record<string, unknown> {
  const next = { ...record(settings) };
  if (enabled === null) delete next.desktopEnabled;
  else next.desktopEnabled = enabled;
  return next;
}
