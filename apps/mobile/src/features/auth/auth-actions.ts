import { z } from "zod";
import { getSchoolRoles } from "@/api/schools";
import { resolveLogin, changeOwnPassword } from "@/api/auth";
import { ApiError, SessionChangedError } from "@/lib/api-error";
import { signOut } from "@/lib/sign-out";
import { authClient, isCurrentAuthResponse } from "@/lib/auth-client";
import { mobileRoles } from "@/lib/permissions";
import { sessionStore } from "@/lib/session";
import { changePasswordRequest } from "./forms";

const authenticationResponseSchema = z.object({
  twoFactorRedirect: z.boolean().optional(),
  user: z.object({ mustChangePassword: z.boolean().optional() }).optional(),
});

export class UnsupportedMobileRoleError extends Error {
  constructor() {
    super(
      "Your role isn't available on mobile. Please use your school's web portal.",
    );
    this.name = "UnsupportedMobileRoleError";
  }
}

export class UnsupportedMobileTwoFactorError extends Error {
  constructor() {
    super(
      "This account requires two-factor verification, which isn't available in the mobile app yet. Please use your school's web portal.",
    );
    this.name = "UnsupportedMobileTwoFactorError";
  }
}

function assertCurrentSchool(revision: number, subdomain: string) {
  const session = sessionStore.getSnapshot();
  if (
    sessionStore.getRevision() !== revision ||
    session.subdomain !== subdomain ||
    session.status !== "signedOut"
  )
    throw new SessionChangedError();
}

export async function signInWithSchoolCredentials(input: {
  subdomain: string;
  login: string;
  password: string;
}): Promise<"complete"> {
  const subdomain = input.subdomain.trim().toLowerCase();
  const revision = sessionStore.getRevision();
  assertCurrentSchool(revision, subdomain);
  const resolved = await resolveLogin({
    params: { subdomain },
    request: { identifier: input.login },
  });
  assertCurrentSchool(revision, subdomain);
  const result = await authClient.signIn.email({
    email: resolved.email,
    password: input.password,
  });
  if (result.error) throw result.error;
  return establishAuthenticatedResponse(result.data, subdomain);
}

export async function establishAuthenticatedResponse(
  data: unknown,
  subdomain: string,
): Promise<"complete"> {
  if (!isCurrentAuthResponse(data)) throw new SessionChangedError();
  const parsed = authenticationResponseSchema.safeParse(data);
  if (!parsed.success)
    throw new Error("The sign-in response could not be verified.");
  if (parsed.data.twoFactorRedirect)
    throw new UnsupportedMobileTwoFactorError();

  const current = sessionStore.getSnapshot();
  const revision = sessionStore.getRevision();
  if (!current.token || current.subdomain !== subdomain || !subdomain.trim())
    throw new Error("A verified sign-in token is required.");

  const membership = await getSchoolRoles();
  if (sessionStore.getRevision() !== revision) throw new SessionChangedError();
  const roles = mobileRoles(membership.roles);
  if (!roles.length) {
    try {
      await signOut();
    } catch {
      throw new Error(
        "Your role isn't available on mobile. The local session was cleared, but server sign-out could not be confirmed.",
      );
    }
    throw new UnsupportedMobileRoleError();
  }

  await sessionStore.establish({
    token: current.token,
    subdomain,
    roles,
    mustChangePassword: parsed.data.user?.mustChangePassword,
  });
  return "complete";
}

export async function changePasswordForCurrentSession(
  input: Parameters<typeof changePasswordRequest>[0],
): Promise<void> {
  const current = sessionStore.getSnapshot();
  const revision = sessionStore.getRevision();
  if (
    current.status !== "needsPasswordChange" ||
    !current.token ||
    !current.subdomain
  )
    throw new Error("A password-change session is required.");

  await changeOwnPassword({ request: changePasswordRequest(input) });
  if (sessionStore.getRevision() !== revision) throw new SessionChangedError();
  await sessionStore.establish({
    token: current.token,
    subdomain: current.subdomain,
    roles: current.roles,
    activeRole: current.activeRole ?? current.rememberedRole,
  });
}

export async function changePasswordForAuthenticatedSession(
  input: Parameters<typeof changePasswordRequest>[0],
): Promise<void> {
  const current = sessionStore.getSnapshot();
  const revision = sessionStore.getRevision();
  if (current.status !== "ready" || !current.token || !current.subdomain)
    throw new Error("An active school session is required.");

  await changeOwnPassword({ request: changePasswordRequest(input) });
  if (sessionStore.getRevision() !== revision) throw new SessionChangedError();
}

export function isRateLimited(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 429;
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 429
  );
}
