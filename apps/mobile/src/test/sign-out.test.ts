import { signOut } from "@/lib/sign-out";
import { authClient } from "@/lib/auth-client";
import { clearSession } from "@/lib/session";
jest.mock("@/lib/session", () => ({
  getToken: jest.fn(() => "revocation-fixture"),
  clearSession: jest.fn(async () => {}),
}));
jest.mock("@/lib/auth-client", () => ({
  authClient: { signOut: jest.fn(async () => ({ error: null })) },
}));
test("logout invalidates local state before awaiting server revocation", async () => {
  const order: string[] = [];
  jest.mocked(clearSession).mockImplementation(async () => {
    order.push("clear");
  });
  jest.mocked(authClient.signOut).mockImplementation(async () => {
    order.push("revoke");
    return { error: null } as never;
  });
  await signOut();
  expect(order).toEqual(["clear", "revoke"]);
  expect(authClient.signOut).toHaveBeenCalledWith({
    fetchOptions: { auth: { type: "Bearer", token: "revocation-fixture" } },
  });
});
test("revocation is still attempted when local credential deletion fails", async () => {
  jest
    .mocked(clearSession)
    .mockRejectedValueOnce(new Error("fixture storage failure"));
  await expect(signOut()).rejects.toThrow("clear saved credentials");
  expect(authClient.signOut).toHaveBeenCalled();
});
