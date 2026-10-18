import { ForbiddenException } from "@nestjs/common";

/** Machine-readable marker the web client looks for in the `error` field. */
export const PASSWORD_CHANGE_REQUIRED = "PASSWORD_CHANGE_REQUIRED";

/**
 * Blocks any session whose password was issued/reset by an administrator and
 * has not yet been replaced by its owner. Called from the tenant and
 * super-admin guards, so every business endpoint is covered; only the
 * account endpoints (change password, /me, sign-out) stay reachable.
 */
export function assertPasswordChangeNotPending(user: { mustChangePassword?: unknown } | undefined) {
  if (user?.mustChangePassword === true) {
    throw new ForbiddenException({
      message: "You must change your temporary password before continuing.",
      error: PASSWORD_CHANGE_REQUIRED,
    });
  }
}
