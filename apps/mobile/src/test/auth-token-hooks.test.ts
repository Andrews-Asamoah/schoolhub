import { createTokenHooks } from "@/lib/auth-token-hooks";
import { createSessionStore, type SessionStorage } from "@/lib/session-core";
function fixture() {
  const storage: SessionStorage = {
    readToken: async () => null,
    writeToken: jest.fn(async () => {}),
    readContext: async () => ({ subdomain: "school", role: null }),
    writeContext: async () => {},
  };
  const store = createSessionStore(storage);
  return { store, hooks: createTokenHooks(store), storage };
}
const response = {
  headers: new Headers({ "set-auth-token": "response-fixture" }),
};
test("a current authentication response may save its secure token", async () => {
  const { hooks, store } = fixture();
  const request = { url: "/api/auth/sign-in/email" };
  hooks.onRequest(request);
  await hooks.onSuccess({ request, response });
  expect(store.getSnapshot().token).toBe("response-fixture");
});
test.each(["/api/auth/get-session", "/api/auth/sign-in/email"])(
  "late %s response cannot undo logout",
  async (url) => {
    const { hooks, store, storage } = fixture();
    await store.establish({
      token: "initial-fixture",
      subdomain: "school",
      roles: ["teacher"],
    });
    const request = { url };
    hooks.onRequest(request);
    await store.clear();
    jest.mocked(storage.writeToken).mockClear();
    await hooks.onSuccess({ request, response });
    expect(store.getSnapshot().status).toBe("signedOut");
    expect(store.getSnapshot().token).toBeNull();
    expect(storage.writeToken).not.toHaveBeenCalled();
  },
);
test("responses without a matching request generation fail closed", async () => {
  const { hooks, store } = fixture();
  await hooks.onSuccess({
    request: { url: "/api/auth/get-session" },
    response,
  });
  expect(store.getSnapshot().token).toBeNull();
});
test("sign-out responses cannot save a token, even in the current generation", async () => {
  const { hooks, store } = fixture();
  const request = { url: "/api/auth/sign-out" };
  hooks.onRequest(request);
  await hooks.onSuccess({ request, response });
  expect(store.getSnapshot().token).toBeNull();
});

test("response bodies lose ownership when another session begins", async () => {
  const { store, hooks } = fixture();
  const request = { url: "/api/auth/get-session" };
  const data = { user: { role: "teacher" } };
  hooks.onRequest(request);
  await hooks.onSuccess({ request, data, response });
  expect(hooks.isCurrentResponse(data)).toBe(true);
  await store.clear();
  expect(hooks.isCurrentResponse(data)).toBe(false);
});

test("logout during a secure write cannot bless an old response as current", async () => {
  const { store, hooks, storage } = fixture();
  let finish!: () => void;
  jest.mocked(storage.writeToken).mockImplementation(async (token) => {
    if (token)
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
  });
  const request = { url: "/api/auth/sign-in/email" };
  const data = { user: { role: "teacher" } };
  hooks.onRequest(request);
  const saving = hooks.onSuccess({ request, response, data });
  await Promise.resolve();
  const logout = store.clear();
  finish();
  await Promise.all([saving, logout]);
  expect(store.getSnapshot().token).toBeNull();
  expect(hooks.isCurrentResponse(data)).toBe(false);
});
