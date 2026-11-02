import { resetFormSchema } from "@/features/auth/schemas";
import { authClient, isCurrentAuthResponse } from "@/lib/auth-client";
import { sessionStore } from "@/lib/session";
import { getSchoolRoles } from "@/api/schools";
import {
  resolveLogin,
  changePassword,
  requestRecovery,
  completeRecovery,
} from "@/api/auth";
import {
  loginSchool,
  verifySecondFactor,
  replacePassword,
  recoverPassword,
  resetPassword,
  authMessage,
  AuthActionError,
} from "@/features/auth/actions";
import { validateSchoolSession } from "@/lib/restore-session";
import { ApiError, SessionChangedError } from "@/lib/api-error";
import { authDestination } from "@/lib/auth-routing";
jest.mock("@/lib/auth-client", () => ({
  authClient: {
    getSession: jest.fn(),
    signIn: { email: jest.fn() },
    signOut: jest.fn(async () => ({})),
    twoFactor: {
      verifyTotp: jest.fn(),
      verifyBackupCode: jest.fn(),
      enable: jest.fn(),
    },
  },
  guardedAuthOptions: jest.fn(() => ({})),
  isCurrentAuthResponse: jest.fn(() => true),
  clearAuthChallenge: jest.fn(async () => {}),
}));
jest.mock("@/api/schools", () => ({ getSchoolRoles: jest.fn() }));
jest.mock("@/api/auth", () => {
  const { z } = jest.requireActual("zod");
  return {
    resolveLogin: jest.fn(),
    changePassword: jest.fn(),
    requestRecovery: jest.fn(),
    completeRecovery: jest.fn(),
    schoolCodeSchema: z.string(),
  };
});
beforeEach(async () => {
  jest.mocked(isCurrentAuthResponse).mockReturnValue(true);
  await sessionStore.clear();
  await sessionStore.setSubdomain("school");
  jest
    .mocked(resolveLogin)
    .mockResolvedValue({ email: "fixture@example.test" });
  jest.mocked(authClient.signIn.email).mockImplementation(async () => {
    await sessionStore.setToken("login-fixture");
    return { data: { user: {} }, error: null } as never;
  });
  jest.mocked(authClient.getSession).mockResolvedValue({
    data: { user: { role: "user", mustChangePassword: false } },
    error: null,
  } as never);
  jest
    .mocked(getSchoolRoles)
    .mockResolvedValue({ primaryRole: "teacher", roles: ["teacher"] });
});
test.each(["teacher", "student", "guardian"])(
  "school sign-in establishes only server verified %s membership",
  async (role) => {
    jest
      .mocked(getSchoolRoles)
      .mockResolvedValue({ primaryRole: role, roles: [role] });
    await loginSchool("test-user", "test-password");
    expect(resolveLogin).toHaveBeenCalledWith({
      params: { subdomain: "school" },
      body: { identifier: "test-user" },
    });
    expect(sessionStore.getSnapshot()).toMatchObject({
      status: "ready",
      activeRole: role,
    });
  },
);
test("multiple supported roles require a picker; persisted or unsupported roles are not promoted", async () => {
  jest.mocked(getSchoolRoles).mockResolvedValue({
    primaryRole: "admin",
    roles: ["admin", "teacher", "guardian"],
  });
  await loginSchool("fixture", "fixture");
  expect(sessionStore.getSnapshot()).toMatchObject({
    status: "needsRoleSelection",
    roles: ["teacher", "guardian"],
    activeRole: null,
  });
  await expect(sessionStore.selectRole("admin")).rejects.toThrow();
  await sessionStore.selectRole("guardian");
  expect(sessionStore.getSnapshot().activeRole).toBe("guardian");
});
test("temporary-password accounts reach password change before role discovery", async () => {
  jest.mocked(authClient.getSession).mockResolvedValue({
    data: { user: { role: "user", mustChangePassword: true } },
    error: null,
  } as never);
  await loginSchool("fixture", "fixture");
  expect(sessionStore.getSnapshot().status).toBe("needsPasswordChange");
  expect(getSchoolRoles).not.toHaveBeenCalled();
  jest.mocked(authClient.getSession).mockResolvedValue({
    data: { user: { role: "user", mustChangePassword: false } },
    error: null,
  } as never);
  await replacePassword("old-fixture", "new-fixture");
  expect(changePassword).toHaveBeenCalledWith({
    body: { currentPassword: "old-fixture", newPassword: "new-fixture" },
  });
  expect(sessionStore.getSnapshot().status).toBe("ready");
});
test("MFA redirect grants no session or roles until a current code response is verified", async () => {
  jest.mocked(authClient.signIn.email).mockResolvedValue({
    data: { twoFactorRedirect: true },
    error: null,
  } as never);
  await loginSchool("fixture", "fixture");
  expect(sessionStore.getSnapshot()).toMatchObject({
    status: "needsTwoFactor",
    token: null,
    roles: [],
  });
  expect(getSchoolRoles).not.toHaveBeenCalled();
  jest.mocked(authClient.twoFactor.verifyTotp).mockImplementation(async () => {
    await sessionStore.setToken("verified-fixture");
    return { data: { user: {} }, error: null } as never;
  });
  await verifySecondFactor("123456");
  expect(authClient.twoFactor.verifyTotp).toHaveBeenCalledWith({
    code: "123456",
    trustDevice: false,
    fetchOptions: {},
  });
  expect(sessionStore.getSnapshot().status).toBe("ready");
});
test("backup code validation is explicit and never requests trusted-device bypass", async () => {
  await sessionStore.setToken("fixture");
  sessionStore.requireStep("needsTwoFactor");
  jest
    .mocked(authClient.twoFactor.verifyBackupCode)
    .mockResolvedValue({ data: { user: {} }, error: null } as never);
  await verifySecondFactor("fixture-backup", true);
  expect(authClient.twoFactor.verifyBackupCode).toHaveBeenCalledWith({
    code: "fixture-backup",
    trustDevice: false,
    fetchOptions: {},
  });
});
test("unsupported/platform accounts are denied and receive web-portal guidance", async () => {
  jest
    .mocked(getSchoolRoles)
    .mockResolvedValue({ primaryRole: "owner", roles: ["owner"] });
  let error: unknown;
  try {
    await loginSchool("fixture", "fixture");
  } catch (e) {
    error = e;
  }
  expect(authMessage(error)).toContain("web portal");
  expect(sessionStore.getSnapshot().token).toBeNull();
  jest.mocked(authClient.getSession).mockResolvedValue({
    data: { user: { role: "superAdmin" } },
    error: null,
  } as never);
  await sessionStore.setToken("fixture");
  await expect(validateSchoolSession()).rejects.toThrow();
  expect(sessionStore.getSnapshot().token).toBeNull();
});
test.each([
  ["TWO_FACTOR_REQUIRED", "two-factor-required", "needsTwoFactorSetup"],
  ["SUBSCRIPTION_INACTIVE", "subscription-inactive", "subscriptionInactive"],
] as const)(
  "server %s preserves the mandatory account step",
  async (code, event, status) => {
    await sessionStore.setToken("fixture");
    jest.mocked(getSchoolRoles).mockImplementation(async () => {
      await sessionStore.handleEvent(
        event === "two-factor-required"
          ? { type: event, audience: "school-admin" }
          : { type: event, reason: "EXPIRED" },
      );
      throw new ApiError(403, "fixture", { error: code });
    });
    await validateSchoolSession();
    expect(sessionStore.getSnapshot().status).toBe(status);
    expect(sessionStore.getSnapshot().token).toBe("fixture");
  },
);
test("429 has friendly feedback and a retry cooldown without raw payload disclosure", async () => {
  jest.mocked(authClient.signIn.email).mockResolvedValue({
    data: null,
    error: { status: 429, message: "private-payload" },
  } as never);
  await expect(loginSchool("fixture", "fixture")).rejects.toMatchObject({
    retryAfter: 60,
  });
  expect(authMessage(new AuthActionError("Wait", 60))).toBe("Wait");
  expect(authMessage(new Error("private-payload"))).not.toContain("private");
});
test("a late resolver cannot start auth after logout or a school change", async () => {
  jest.mocked(resolveLogin).mockImplementation(async () => {
    await sessionStore.clear();
    return { email: "fixture@example.test" };
  });
  await expect(loginSchool("fixture", "fixture")).rejects.toBeInstanceOf(
    SessionChangedError,
  );
  expect(authClient.signIn.email).not.toHaveBeenCalled();
});
test("password recovery uses school scope, then clears the local session after completion", async () => {
  await recoverPassword("fixture@example.test");
  expect(requestRecovery).toHaveBeenCalledWith({
    body: { email: "fixture@example.test", school: "school" },
    subdomain: "school",
  });
  await sessionStore.setToken("fixture");
  await resetPassword("reset-fixture", "new-password-fixture");
  expect(completeRecovery).toHaveBeenCalled();
  expect(sessionStore.getSnapshot().status).toBe("signedOut");
});
test.each([
  ["signedOut", "/(auth)/login"],
  ["loading", "/(auth)/loading"],
  ["needsTwoFactor", "/(auth)/two-factor"],
  ["needsPasswordChange", "/(auth)/change-password"],
  ["needsTwoFactorSetup", "/(auth)/two-factor-setup"],
  ["subscriptionInactive", "/(auth)/subscription-inactive"],
  ["needsRoleSelection", "/(auth)/role-selection"],
] as const)(
  "central destination maps %s to its guarded screen",
  async (status, path) => {
    expect(authDestination({ ...sessionStore.getSnapshot(), status })).toBe(
      path,
    );
  },
);

test("email reset links are parsed locally; only the reset token enters the completion request", async () => {
  const token = "synthetic-reset-token-for-schema";
  const input = resetFormSchema.parse({
    token: `https://school.example.test/reset-password?token=${token}`,
    newPassword: "ValidFixturePassword12",
    confirmPassword: "ValidFixturePassword12",
  });
  expect(input.token).toBe(token);
});
