import { getSchoolRoles } from "@/api/schools";
import { authClient } from "./auth-client";
import { hydrateSession, sessionStore } from "./session";
import { isMobileRole } from "./permissions";
import { log } from "./log";

export async function restoreSession() {
  await hydrateSession();
  const saved = sessionStore.getSnapshot();
  if (!saved.token) return;
  try {
    const result = await authClient.getSession();
    const user = result.data?.user as
      { role?: string; mustChangePassword?: boolean } | undefined;
    if (
      result.error ||
      !user ||
      user.role === "superAdmin" ||
      !saved.subdomain
    ) {
      await sessionStore.clear();
      return;
    }
    // A sign-out while the request was in flight must never resurrect its token.
    if (
      !sessionStore.getSnapshot().token ||
      sessionStore.getSnapshot().status !== "loading"
    )
      return;
    const token = sessionStore.getSnapshot().token!;
    const membership = await getSchoolRoles();
    if (sessionStore.getSnapshot().token !== token) return;
    const preferred =
      isMobileRole(saved.rememberedRole) &&
      membership.roles.includes(saved.rememberedRole)
        ? saved.rememberedRole
        : null;
    await sessionStore.establish({
      token,
      subdomain: saved.subdomain,
      roles: membership.roles,
      activeRole: preferred,
      mustChangePassword: user.mustChangePassword,
    });
  } catch {
    log("session.restore_failed");
    await sessionStore.clear().catch(() => log("session.storage_failed"));
  }
}
