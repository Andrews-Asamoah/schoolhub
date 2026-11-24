import {
  establishAuthenticatedResponse,
  signInWithSchoolCredentials,
  changePasswordForAuthenticatedSession,
  UnsupportedMobileRoleError,
  MobileTwoFactorExpiredError,
  verifyMobileTwoFactor,
} from "@/features/auth/auth-actions";

type MockSessionState = {
  status: string;
  token: string | null;
  subdomain: string | null;
  roles: string[];
  activeRole: string | null;
  rememberedRole: string | null;
};
const mockSession: {
  state: MockSessionState;
  revision: number;
  establish: jest.Mock;
} = {
  state: {
    status: "signedOut",
    token: null as string | null,
    subdomain: "school",
    roles: [] as string[],
    activeRole: null,
    rememberedRole: null,
  },
  revision: 0,
  establish: jest.fn(async (value: Record<string, unknown>) => {
    mockSession.state = {
      ...mockSession.state,
      ...value,
    } as typeof mockSession.state;
    mockSession.revision++;
  }),
};
const mockGetSchoolRoles = jest.fn();
const mockResolveLogin = jest.fn();
const mockSignInEmail = jest.fn();
const mockHasChallenge = jest.fn();
const mockVerifyBackupCode = jest.fn();
const mockIsCurrentAuthResponse = jest.fn();
const mockSignOut = jest.fn();
const mockChangeOwnPassword = jest.fn();

jest.mock("@/api/schools", () => ({
  getSchoolRoles: (...args: unknown[]) => mockGetSchoolRoles(...args),
}));
jest.mock("@/api/auth", () => ({
  resolveLogin: (...args: unknown[]) => mockResolveLogin(...args),
  changeOwnPassword: (...args: unknown[]) => mockChangeOwnPassword(...args),
}));
jest.mock("@/lib/session", () => ({
  sessionStore: {
    getSnapshot: () => mockSession.state,
    getRevision: () => mockSession.revision,
    establish: (value: Record<string, unknown>) => mockSession.establish(value),
  },
}));
jest.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: { email: (...args: unknown[]) => mockSignInEmail(...args) },
    twoFactor: {
      verifyBackupCode: (...args: unknown[]) => mockVerifyBackupCode(...args),
    },
  },
  hasTwoFactorChallenge: () => mockHasChallenge(),
  clearTwoFactorChallenge: jest.fn(),
  isCurrentAuthResponse: (...args: unknown[]) =>
    mockIsCurrentAuthResponse(...args),
}));
jest.mock("@/lib/sign-out", () => ({
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));

beforeEach(() => {
  mockSession.state = {
    status: "signedOut",
    token: null,
    subdomain: "school",
    roles: [],
    activeRole: null,
    rememberedRole: null,
  };
  mockSession.revision = 0;
  mockGetSchoolRoles.mockReset();
  mockResolveLogin
    .mockReset()
    .mockResolvedValue({ email: "student@example.test" });
  mockSignInEmail.mockReset();
  mockIsCurrentAuthResponse.mockReset();
  mockSignOut.mockReset().mockResolvedValue(undefined);
  mockChangeOwnPassword.mockReset().mockResolvedValue({ success: true });
  mockSession.establish.mockClear();
});

test("stale school-lookup responses cannot start authentication", async () => {
  mockResolveLogin.mockImplementation(async () => {
    mockSession.revision++;
    return { email: "student@example.test" };
  });
  await expect(
    signInWithSchoolCredentials({
      subdomain: "school",
      login: "student",
      password: "fixture-password",
    }),
  ).rejects.toThrow("session has changed");
  expect(mockSignInEmail).not.toHaveBeenCalled();
});

test("a stale Better Auth response cannot discover roles or establish a session", async () => {
  mockSignInEmail.mockResolvedValue({
    data: { user: { mustChangePassword: false } },
    error: null,
  });
  mockIsCurrentAuthResponse.mockReturnValue(false);
  await expect(
    signInWithSchoolCredentials({
      subdomain: "school",
      login: "student",
      password: "fixture-password",
    }),
  ).rejects.toThrow("session has changed");
  expect(mockGetSchoolRoles).not.toHaveBeenCalled();
  expect(mockSession.establish).not.toHaveBeenCalled();
});

test("only teacher, student and guardian roles are established", async () => {
  mockSession.state = {
    ...mockSession.state,
    status: "loading",
    token: "verified-token",
  };
  mockGetSchoolRoles.mockResolvedValue({
    primaryRole: "owner",
    roles: ["owner", "teacher", "accountant"],
  });
  mockIsCurrentAuthResponse.mockReturnValue(true);
  await expect(
    establishAuthenticatedResponse(
      { user: { mustChangePassword: true } },
      "school",
    ),
  ).resolves.toBe("complete");
  expect(mockSession.establish).toHaveBeenCalledWith(
    expect.objectContaining({
      token: "verified-token",
      subdomain: "school",
      roles: ["teacher"],
      mustChangePassword: true,
    }),
  );
});

test("unsupported accounts are signed out instead of receiving a mobile role", async () => {
  mockSession.state = {
    ...mockSession.state,
    status: "loading",
    token: "verified-token",
  };
  mockGetSchoolRoles.mockResolvedValue({
    primaryRole: "owner",
    roles: ["owner", "accountant"],
  });
  mockIsCurrentAuthResponse.mockReturnValue(true);
  await expect(
    establishAuthenticatedResponse({ user: {} }, "school"),
  ).rejects.toBeInstanceOf(UnsupportedMobileRoleError);
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  expect(mockSession.establish).not.toHaveBeenCalled();
});

test("the password step opens verification without discovering roles", async () => {
  mockIsCurrentAuthResponse.mockReturnValue(true);
  mockHasChallenge.mockReturnValue(true);
  mockSignInEmail.mockResolvedValue({ data: { twoFactorRedirect: true } });
  await expect(
    signInWithSchoolCredentials({
      subdomain: "school",
      login: "student",
      password: "fixture-password",
    }),
  ).resolves.toBe("two-factor");
  expect(mockGetSchoolRoles).not.toHaveBeenCalled();
  expect(mockSession.establish).not.toHaveBeenCalled();
});

test("expired verification fails closed", async () => {
  mockHasChallenge.mockReturnValue(false);
  await expect(
    verifyMobileTwoFactor("school", "backup", true),
  ).rejects.toBeInstanceOf(MobileTwoFactorExpiredError);
  expect(mockVerifyBackupCode).not.toHaveBeenCalled();
  expect(mockSession.establish).not.toHaveBeenCalled();
});

test("successful backup-code verification discovers mobile roles", async () => {
  mockHasChallenge.mockReturnValue(true);
  mockIsCurrentAuthResponse.mockReturnValue(true);
  mockVerifyBackupCode.mockImplementation(async () => {
    mockSession.state.token = "verified-token";
    mockSession.state.status = "loading";
    return { data: { user: {} } };
  });
  mockGetSchoolRoles.mockResolvedValue({
    primaryRole: "teacher",
    roles: ["teacher"],
  });
  await verifyMobileTwoFactor("school", "backup", true);
  expect(mockVerifyBackupCode).toHaveBeenCalledWith({
    code: "backup",
    trustDevice: false,
  });
  expect(mockSession.establish).toHaveBeenCalledTimes(1);
});

test("authenticated users can change their password without re-establishing the session", async () => {
  mockSession.state = {
    status: "ready",
    token: "verified-token",
    subdomain: "school",
    roles: ["teacher"],
    activeRole: "teacher",
    rememberedRole: "teacher",
  };
  await expect(
    changePasswordForAuthenticatedSession({
      currentPassword: "Current123",
      newPassword: "Replacement123",
      confirmPassword: "Replacement123",
    }),
  ).resolves.toBeUndefined();
  expect(mockChangeOwnPassword).toHaveBeenCalledWith({
    request: {
      currentPassword: "Current123",
      newPassword: "Replacement123",
    },
  });
  expect(mockSession.establish).not.toHaveBeenCalled();
});

test("authenticated password changes reject signed-out and stale sessions", async () => {
  await expect(
    changePasswordForAuthenticatedSession({
      currentPassword: "Current123",
      newPassword: "Replacement123",
      confirmPassword: "Replacement123",
    }),
  ).rejects.toThrow("active school session");
  expect(mockChangeOwnPassword).not.toHaveBeenCalled();

  mockSession.state = {
    status: "ready",
    token: "verified-token",
    subdomain: "school",
    roles: ["teacher"],
    activeRole: "teacher",
    rememberedRole: "teacher",
  };
  mockChangeOwnPassword.mockImplementation(async () => {
    mockSession.revision++;
    return { success: true };
  });
  await expect(
    changePasswordForAuthenticatedSession({
      currentPassword: "Current123",
      newPassword: "Replacement123",
      confirmPassword: "Replacement123",
    }),
  ).rejects.toThrow("session has changed");
});
