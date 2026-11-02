import { restoreSession } from "@/lib/restore-session";
import { authClient, isCurrentAuthResponse } from "@/lib/auth-client";
import { getSchoolRoles } from "@/api/schools";
import { sessionStorage, sessionStore } from "@/lib/session";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
jest.mock("@/lib/auth-client", () => ({
  authClient: { getSession: jest.fn() },
  guardedAuthOptions: jest.fn(() => ({})),
  isCurrentAuthResponse: jest.fn(() => true),
}));
jest.mock("@/api/schools", () => ({ getSchoolRoles: jest.fn() }));
beforeEach(async () => {
  jest.mocked(isCurrentAuthResponse).mockReturnValue(true);
  await sessionStore.clear();
  await sessionStore.setSubdomain("school");
  await sessionStore.setToken("fixture-session");
  jest.mocked(authClient.getSession).mockResolvedValue({
    data: { user: { role: "teacher" } },
    error: null,
  } as never);
  jest
    .mocked(getSchoolRoles)
    .mockResolvedValue({ primaryRole: "teacher", roles: ["teacher"] });
});
test("restoration requires server-validated session and supported membership", async () => {
  await restoreSession();
  expect(sessionStore.getSnapshot()).toMatchObject({
    status: "ready",
    activeRole: "teacher",
  });
});
test("Super Admin is rejected before school-role discovery", async () => {
  jest.mocked(authClient.getSession).mockResolvedValue({
    data: { user: { role: "superAdmin" } },
    error: null,
  } as never);
  await restoreSession();
  expect(sessionStore.getSnapshot().status).toBe("signedOut");
  expect(getSchoolRoles).not.toHaveBeenCalled();
});
test("nonmobile memberships are rejected without promoting a fallback role", async () => {
  const spy = jest.spyOn(console, "warn").mockImplementation(() => {});
  jest
    .mocked(getSchoolRoles)
    .mockResolvedValue({ primaryRole: "admin", roles: ["admin"] });
  await restoreSession();
  expect(sessionStore.getSnapshot().status).toBe("signedOut");
  spy.mockRestore();
});
test("a late session response cannot undo sign-out", async () => {
  let finish!: (value: unknown) => void;
  jest.mocked(authClient.getSession).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve as never;
      }) as never,
  );
  const pending = restoreSession();
  await Promise.resolve();
  await sessionStore.clear();
  finish({ data: { user: { role: "teacher" } }, error: null });
  await pending;
  expect(sessionStore.getSnapshot().status).toBe("signedOut");
  expect(getSchoolRoles).not.toHaveBeenCalled();
});
test("secure tokens never enter the plain context storage", async () => {
  await restoreSession();
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
    "schoolhub.bearer-token",
    "fixture-session",
  );
  expect(
    JSON.stringify(jest.mocked(AsyncStorage.multiSet).mock.calls),
  ).not.toContain("fixture-session");
});

test("logout marker prevents restoration when secure token deletion fails", async () => {
  jest
    .mocked(SecureStore.deleteItemAsync)
    .mockRejectedValueOnce(new Error("fixture storage unavailable"));
  await expect(sessionStorage.writeToken(null)).rejects.toThrow(
    "clear saved credentials",
  );
  expect(AsyncStorage.setItem).toHaveBeenCalledWith(
    "schoolhub:session-disabled",
    "1",
  );
  jest.mocked(AsyncStorage.getItem).mockResolvedValueOnce("1");
  await expect(sessionStorage.readToken()).resolves.toBeNull();
  expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
});

test("an old auth response cannot apply its user flags to a new login", async () => {
  jest.mocked(isCurrentAuthResponse).mockReturnValue(false);
  jest.mocked(authClient.getSession).mockImplementation(async () => {
    await sessionStore.setToken("new-login-fixture");
    return {
      data: { user: { role: "teacher", mustChangePassword: false } },
      error: null,
    } as never;
  });
  await restoreSession();
  expect(getSchoolRoles).not.toHaveBeenCalled();
  expect(sessionStore.getSnapshot()).toMatchObject({
    token: "new-login-fixture",
    status: "loading",
    activeRole: null,
  });
});
