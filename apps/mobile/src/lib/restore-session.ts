import { getSchoolRoles } from "@/api/schools";
import {
  authClient,
  isCurrentAuthResponse,
  guardedAuthOptions,
} from "./auth-client";
import { hydrateSession, sessionStore } from "./session";
import { isMobileRole, mobileRoles } from "./permissions";
import {
  ApiError,
  SessionChangedError,
  UnsupportedMobileRoleError,
} from "./api-error";
import { log } from "./log";
/** Server validation shared by startup, sign-in and completion of required account steps. */
export async function validateSchoolSession() {
  const saved = sessionStore.getSnapshot();
  if (!saved.token || !saved.subdomain) return;
  let revision = sessionStore.getRevision();
  sessionStore.beginValidation();
  try {
    const result = await authClient.getSession({
      fetchOptions: {
        ...guardedAuthOptions(revision),
        query: { disableCookieCache: true },
      },
    });
    if (
      result.data
        ? !isCurrentAuthResponse(result.data)
        : sessionStore.getRevision() !== revision
    )
      throw new SessionChangedError();
    if (
      !sessionStore.getSnapshot().token ||
      sessionStore.getSnapshot().status !== "loading"
    )
      throw new SessionChangedError();
    revision = sessionStore.getRevision();
    const user = result.data?.user as
      { role?: string; mustChangePassword?: boolean } | undefined;
    if (result.error || !user || user.role === "superAdmin") {
      await sessionStore.clear();
      throw new UnsupportedMobileRoleError();
    }
    if (user.mustChangePassword) {
      sessionStore.requireStep("needsPasswordChange");
      return;
    }
    const membership = await getSchoolRoles();
    if (sessionStore.getRevision() !== revision)
      throw new SessionChangedError();
    if (!mobileRoles(membership.roles).length) {
      await sessionStore.clear();
      throw new UnsupportedMobileRoleError();
    }
    const preferred =
      isMobileRole(saved.rememberedRole) &&
      membership.roles.includes(saved.rememberedRole)
        ? saved.rememberedRole
        : null;
    await sessionStore.establish({
      token: sessionStore.getSnapshot().token!,
      subdomain: saved.subdomain,
      roles: membership.roles,
      activeRole: preferred,
    });
  } catch (error) {
    // apiFetch already routed mandatory account steps; never erase them in recovery.
    if (
      error instanceof ApiError &&
      [
        "PASSWORD_CHANGE_REQUIRED",
        "TWO_FACTOR_REQUIRED",
        "SUBSCRIPTION_INACTIVE",
      ].includes(error.code ?? "")
    )
      return;
    if (error instanceof SessionChangedError) throw error;
    if (sessionStore.getRevision() === revision) await sessionStore.clear();
    throw error;
  }
}
export async function restoreSession() {
  await hydrateSession();
  if (!sessionStore.getSnapshot().token) return;
  try {
    await validateSchoolSession();
  } catch (error) {
    if (!(error instanceof SessionChangedError)) log("session.restore_failed");
  }
}
