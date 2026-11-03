import {
  establishAuthenticatedResponse,
  signInWithSchoolCredentials,
  UnsupportedMobileRoleError,
  UnsupportedMobileTwoFactorError,
} from "@/features/auth/auth-actions";

const mockSession = {
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
const mockIsCurrentAuthResponse = jest.fn();
const mockSignOut = jest.fn();

jest.mock("@/api/schools", () => ({
  getSchoolRoles: (...args: unknown[]) => mockGetSchoolRoles(...args),
}));
jest.mock("@/api/auth", () => ({
  resolveLogin: (...args: unknown[]) => mockResolveLogin(...args),
  changeOwnPassword: jest.fn(),
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
  },
  isCurrentAuthResponse: (...args: unknown[]) =>
    mockIsCurrentAuthResponse(...args),
}));
jest.mock("@/lib/auth-actions", () => ({
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

test("a two-factor challenge fails closed and directs the account to web", async () => {
  mockIsCurrentAuthResponse.mockReturnValue(true);
  await expect(
    establishAuthenticatedResponse({ twoFactorRedirect: true }, "school"),
  ).rejects.toBeInstanceOf(UnsupportedMobileTwoFactorError);
  expect(mockGetSchoolRoles).not.toHaveBeenCalled();
  expect(mockSession.establish).not.toHaveBeenCalled();
});
