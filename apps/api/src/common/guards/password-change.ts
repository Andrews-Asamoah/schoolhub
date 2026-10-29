import { ForbiddenException } from "@nestjs/common";

/** Machine-readable marker the web client looks for in the `error` field. */
export const PASSWORD_CHANGE_REQUIRED = "PASSWORD_CHANGE_REQUIRED";
/** The temporary password was never used in time; an administrator must reissue it. */
export const TEMPORARY_PASSWORD_EXPIRED = "TEMPORARY_PASSWORD_EXPIRED";

/** How long an administrator-issued password stays usable. */
export const TEMPORARY_PASSWORD_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function temporaryPasswordExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + TEMPORARY_PASSWORD_TTL_MS);
}

type PendingUser = {
  mustChangePassword?: unknown;
  temporaryPasswordExpiresAt?: Date | string | null;
};

/** True when an administrator-issued password is still unused and past its expiry. */
export function isTemporaryPasswordExpired(user: PendingUser | undefined, now: Date = new Date()): boolean {
  if (user?.mustChangePassword !== true || !user.temporaryPasswordExpiresAt) return false;
  return new Date(user.temporaryPasswordExpiresAt).getTime() <= now.getTime();
}

/**
 * Blocks any session whose password was issued/reset by an administrator and
 * has not yet been replaced by its owner. Called from the tenant and
 * super-admin guards, so every business endpoint is covered; only the
 * account endpoints (change password, /me, sign-out) stay reachable.
 * An unused temporary password also stops working once it expires.
 */
export function assertPasswordChangeNotPending(user: PendingUser | undefined, now: Date = new Date()) {
  if (isTemporaryPasswordExpired(user, now)) {
    throw new ForbiddenException({
      message: "Your temporary password has expired. Ask your school administrator to issue a new one.",
      error: TEMPORARY_PASSWORD_EXPIRED,
    });
  }
  if (user?.mustChangePassword === true) {
    throw new ForbiddenException({
      message: "You must change your temporary password before continuing.",
      error: PASSWORD_CHANGE_REQUIRED,
    });
  }
}
