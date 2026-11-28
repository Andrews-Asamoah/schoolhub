import { getSchoolRoles } from "@/api/schools";
import { authClient, isCurrentAuthResponse } from "./auth-client";
import { hydrateSession, sessionStore } from "./session";
import { isMobileRole } from "./permissions";
import { ApiError } from "./api-error";
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
    if (
      result.error &&
      (result.error.status === 0 ||
        result.error.status === 408 ||
        result.error.status === 429 ||
        result.error.status >= 500)
    )
      throw new ApiError(
        result.error.status,
        "Unable to verify the saved session.",
        null,
      );
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
          retry &&
          ["subscriptionInactive", "restoreUnavailable"].includes(
            sessionStore.getSnapshot().status,
          )
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
      restoring: true,
    });
  } catch (error) {
    if (sessionStore.getRevision() !== ownerRevision) return;
    if (
      error instanceof TypeError ||
      (error instanceof ApiError &&
        (error.status === 0 ||
          error.status === 408 ||
          error.status === 429 ||
          error.status >= 500))
    ) {
      sessionStore.markRestoreUnavailable(ownerRevision);
      if (retry)
        throw new Error(
          "Unable to verify your session. Check your connection and try again.",
        );
      return;
    }
    if (retry)
      throw new Error(
        "Unable to refresh your school session. Try again shortly.",
      );
    log("session.restore_failed");
    await sessionStore.clear().catch(() => log("session.storage_failed"));
  }
}
