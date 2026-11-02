import { useSyncExternalStore } from "react";
import {
  authClient,
  guardedAuthOptions,
  clearAuthChallenge,
  isCurrentAuthResponse,
} from "@/lib/auth-client";
import { sessionStore } from "@/lib/session";
import { validateSchoolSession } from "@/lib/restore-session";
import {
  SessionChangedError,
  ApiError,
  UnsupportedMobileRoleError,
} from "@/lib/api-error";
import {
  resolveLogin,
  changePassword,
  requestRecovery,
  completeRecovery,
  schoolCodeSchema,
} from "@/api/auth";
import { signOut } from "@/lib/auth-actions";
export type Enrollment = Readonly<{
  secret: string;
  backupCodes: readonly string[];
}>;
let enrollment: Enrollment | null = null;
const listeners = new Set<() => void>();
function publish(value: Enrollment | null) {
  enrollment = value;
  listeners.forEach((fn) => fn());
}
export const useEnrollment = () =>
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => enrollment,
    () => enrollment,
  );
sessionStore.subscribe(() => {
  if (sessionStore.getSnapshot().status === "signedOut") publish(null);
});
export class AuthActionError extends Error {
  constructor(
    message: string,
    public retryAfter = 0,
  ) {
    super(message);
  }
}
export function authMessage(error: unknown): string {
  if (error instanceof AuthActionError) return error.message;
  if (error instanceof UnsupportedMobileRoleError)
    return "This account role is available in the web portal. Mobile supports teachers, students and guardians.";
  if (error instanceof SessionChangedError)
    return "This sign-in attempt has ended. Please try again.";
  if (error instanceof ApiError && error.status === 401)
    return "Your session expired. Please sign in again.";
  if (error instanceof ApiError && error.status === 404)
    return "We couldn't find that school. Check the school code with your school.";
  if (error instanceof ApiError && error.status === 400)
    return "Check the entered details and try again. Ask your school for a replacement if a temporary password expired.";
  if (error instanceof ApiError && error.status === 429)
    return "Too many attempts. Wait a minute before trying again.";
  return "Unable to complete this step. Check your connection and try again.";
}
function check(
  result: { data: unknown; error: { status?: number; code?: string } | null },
  message: string,
  revision?: number,
) {
  if (result.error) {
    if (revision !== undefined && sessionStore.getRevision() !== revision)
      throw new SessionChangedError();
    if (result.error.status === 429)
      throw new AuthActionError(
        "Too many attempts. Wait a minute before trying again.",
        60,
      );
    throw new AuthActionError(message);
  }
  if (!isCurrentAuthResponse(result.data)) throw new SessionChangedError();
  return result.data;
}
export async function loginSchool(identifier: string, password: string) {
  const school = schoolCodeSchema.parse(sessionStore.getSnapshot().subdomain);
  const clearing = sessionStore.clear();
  const revision = sessionStore.getRevision();
  await clearing;
  if (sessionStore.getRevision() !== revision) throw new SessionChangedError();
  await clearAuthChallenge();
  if (sessionStore.getRevision() !== revision) throw new SessionChangedError();
  publish(null);
  const resolved = await resolveLogin({
    params: { subdomain: school },
    body: { identifier },
  });
  if (sessionStore.getRevision() !== revision) throw new SessionChangedError();
  const result = await authClient.signIn.email({
    email: resolved.email,
    password,
    rememberMe: true,
    fetchOptions: guardedAuthOptions(revision),
  });
  const data = check(
    result,
    "Sign-in failed. Check your username and password. If a temporary password expired, ask your school for a replacement.",
    revision,
  ) as { twoFactorRedirect?: boolean };
  if (data.twoFactorRedirect) {
    sessionStore.requireStep("needsTwoFactor");
    return;
  }
  if (!sessionStore.getSnapshot().token)
    throw new AuthActionError(
      "Your secure session could not be created. Please try again.",
    );
  await validateSchoolSession();
}
export async function verifySecondFactor(code: string, backup = false) {
  if (!backup && !/^\d{6}$/.test(code))
    throw new AuthActionError("Enter the six-digit authenticator code.");
  if (sessionStore.getSnapshot().status !== "needsTwoFactor")
    throw new AuthActionError("Sign in again to verify your code.");
  const revision = sessionStore.getRevision();
  const fetchOptions = guardedAuthOptions(revision);
  const result = backup
    ? await authClient.twoFactor.verifyBackupCode({
        code,
        trustDevice: false,
        fetchOptions,
      })
    : await authClient.twoFactor.verifyTotp({
        code,
        trustDevice: false,
        fetchOptions,
      });
  check(
    result,
    "The verification code is invalid, expired or locked. Try another code, or sign in again.",
    revision,
  );
  await validateSchoolSession();
  publish(null);
}
export async function enableSecondFactor(password: string) {
  if (sessionStore.getSnapshot().status !== "needsTwoFactorSetup")
    throw new AuthActionError("Sign in again to set up verification.");
  const result = await authClient.twoFactor.enable({
    password,
    fetchOptions: guardedAuthOptions(sessionStore.getRevision()),
  });
  const data = check(
    result,
    "Verification setup failed. Check your password and try again.",
  ) as { totpURI?: string; backupCodes?: string[] };
  if (!data.totpURI || !data.backupCodes?.length)
    throw new AuthActionError(
      "Verification setup is unavailable. Please try again.",
    );
  const uri = new URL(data.totpURI);
  const secret =
    uri.protocol === "otpauth:" ? uri.searchParams.get("secret") : null;
  if (!secret)
    throw new AuthActionError(
      "Verification setup is unavailable. Please try again.",
    );
  publish(
    Object.freeze({
      secret,
      backupCodes: Object.freeze([...data.backupCodes]),
    }),
  );
  sessionStore.requireStep("needsTwoFactorSetup");
}
export async function confirmEnrollment(code: string) {
  if (!/^\d{6}$/.test(code))
    throw new AuthActionError("Enter the six-digit authenticator code.");
  const result = await authClient.twoFactor.verifyTotp({
    code,
    trustDevice: false,
    fetchOptions: guardedAuthOptions(sessionStore.getRevision()),
  });
  check(result, "The authenticator code is invalid or expired. Try again.");
  publish(null);
  await validateSchoolSession();
}
export async function replacePassword(
  currentPassword: string,
  newPassword: string,
) {
  const revision = sessionStore.getRevision();
  await changePassword({ body: { currentPassword, newPassword } });
  if (sessionStore.getRevision() !== revision) throw new SessionChangedError();
  await validateSchoolSession();
}
export async function recoverPassword(email: string) {
  const school = sessionStore.getSnapshot().subdomain ?? undefined;
  await requestRecovery({ body: { email, school }, subdomain: school });
}
export async function resetPassword(token: string, newPassword: string) {
  const revision = sessionStore.getRevision();
  await completeRecovery({ body: { token, newPassword } });
  if (sessionStore.getRevision() !== revision) throw new SessionChangedError();
  await signOut();
}
export async function cancelAuthentication() {
  publish(null);
  await signOut();
}
