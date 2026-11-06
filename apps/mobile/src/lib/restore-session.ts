import { getSchoolRoles } from "@/api/schools";
import { authClient, isCurrentAuthResponse } from "./auth-client";
import { hydrateSession, sessionStore } from "./session";
import { isMobileRole } from "./permissions";
import { log } from "./log";

export async function restoreSession() {
  await restoreSavedSession(false);
}

export async function retrySession() {
  await restoreSavedSession(true);
}

async function restoreSavedSession(retry: boolean) {
  await hydrateSession();
  const saved = sessionStore.getSnapshot();
  if (!saved.token) return;
  let ownerRevision = sessionStore.getRevision();
  try {
    const result = await authClient.getSession();
    if (
      result.data
        ? !isCurrentAuthResponse(result.data)
        : sessionStore.getRevision() !== ownerRevision
    )
      return;
    ownerRevision = sessionStore.getRevision();
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
      (sessionStore.getSnapshot().status !== "loading" &&
        !(
          retry && sessionStore.getSnapshot().status === "subscriptionInactive"
        ))
    )
      return;
    const token = sessionStore.getSnapshot().token!;
    const membership = await getSchoolRoles();
    if (sessionStore.getRevision() !== ownerRevision) return;
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
    if (sessionStore.getRevision() !== ownerRevision) return;
    if (retry)
      throw new Error(
        "Unable to refresh your school session. Try again shortly.",
      );
    log("session.restore_failed");
    await sessionStore.clear().catch(() => log("session.storage_failed"));
  }
}
