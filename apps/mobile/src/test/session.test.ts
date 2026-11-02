import { createSessionStore, type SessionStorage } from "@/lib/session-core";
function fixture() {
  let token: string | null = null;
  const storage: SessionStorage = {
    readToken: jest.fn(async () => token),
    writeToken: jest.fn(async (value: string | null) => {
      token = value;
    }),
    readContext: jest.fn(async () => ({ subdomain: "school", role: null })),
    writeContext: jest.fn(async () => {}),
  };
  const cleanup = jest.fn(async () => {});
  return {
    storage,
    cleanup,
    store: createSessionStore(storage, cleanup),
    token: () => token,
  };
}
const verified = {
  token: "fixture-session",
  subdomain: "School",
  roles: ["teacher"],
};
test("disk context never authorises a session", async () => {
  const f = fixture();
  f.storage.readToken = async () => "fixture-session";
  f.storage.readContext = async () => ({ subdomain: "school", role: "admin" });
  await f.store.hydrate();
  expect(f.store.getSnapshot()).toMatchObject({
    status: "loading",
    activeRole: null,
    roles: [],
    rememberedRole: null,
  });
});
test("only the three supported roles can establish a verified session", async () => {
  for (const role of ["teacher", "student", "guardian"]) {
    const { store } = fixture();
    await store.establish({ ...verified, roles: [role] });
    expect(store.getSnapshot()).toMatchObject({
      status: "ready",
      activeRole: role,
      subdomain: "school",
    });
  }
  for (const role of [
    "superAdmin",
    "owner",
    "admin",
    "headteacher",
    "staff",
    "accountant",
  ]) {
    const { store } = fixture();
    await expect(
      store.establish({ ...verified, roles: [role] }),
    ).rejects.toThrow();
    expect(store.getSnapshot().status).toBe("signedOut");
  }
});
test("multiple supported roles require an explicit selection", async () => {
  const { store, cleanup } = fixture();
  await store.establish({
    ...verified,
    roles: ["teacher", "guardian", "admin"],
  });
  expect(store.getSnapshot()).toMatchObject({
    status: "needsRoleSelection",
    activeRole: null,
    roles: ["teacher", "guardian"],
  });
  await store.selectRole("guardian");
  expect(store.getSnapshot().activeRole).toBe("guardian");
  expect(cleanup).toHaveBeenCalledTimes(2);
  await expect(store.selectRole("student")).rejects.toThrow();
  await expect(store.selectRole("admin")).rejects.toThrow();
});
test("restricted account states cannot be escaped by switching role", async () => {
  for (const event of [
    { type: "password-change-required" },
    { type: "subscription-inactive", reason: "EXPIRED" },
    { type: "two-factor-required", audience: "school-admin" },
  ] as const) {
    const { store } = fixture();
    await store.establish(verified);
    await store.handleEvent(event);
    await expect(store.selectRole("teacher")).rejects.toThrow();
    expect(store.getSnapshot().status).not.toBe("ready");
  }
});
test("unauthorized clears memory, secure storage and cache", async () => {
  const f = fixture();
  await f.store.establish(verified);
  await f.store.handleEvent({ type: "unauthorized" });
  expect(f.store.getSnapshot()).toMatchObject({
    token: null,
    activeRole: null,
    roles: [],
    status: "signedOut",
  });
  expect(f.token()).toBeNull();
  expect(f.cleanup).toHaveBeenCalledTimes(2);
});
test("late hydration cannot restore a signed-out session", async () => {
  const f = fixture();
  let finish!: (value: string) => void;
  f.storage.readToken = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = f.store.hydrate();
  await f.store.clear();
  finish("stale-fixture");
  await pending;
  expect(f.store.getSnapshot().token).toBeNull();
});
test("sign-out during establishment cannot resurrect a stored token", async () => {
  const f = fixture();
  let finish!: () => void;
  let calls = 0;
  const store = createSessionStore(f.storage, async () => {
    if (++calls === 1)
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
  });
  const pending = store.establish(verified);
  await store.clear();
  finish();
  await pending;
  expect(store.getSnapshot().status).toBe("signedOut");
  expect(f.token()).toBeNull();
});
test("storage failure fails closed", async () => {
  const f = fixture();
  f.storage.writeToken = jest.fn(async (value: string | null) => {
    if (value) throw new Error("fixture write failure");
  });
  await expect(f.store.establish(verified)).rejects.toThrow("securely");
  expect(f.store.getSnapshot().token).toBeNull();
});
test("snapshots are stable and immutable; unsubscribed listeners stop firing", async () => {
  const { store } = fixture();
  expect(store.getSnapshot()).toBe(store.getSnapshot());
  const listener = jest.fn();
  const off = store.subscribe(listener);
  await store.establish(verified);
  expect(Object.isFrozen(store.getSnapshot())).toBe(true);
  expect(Object.isFrozen(store.getSnapshot().roles)).toBe(true);
  off();
  listener.mockClear();
  await store.clear();
  expect(listener).not.toHaveBeenCalled();
});

test("rotated credentials lose ready status until server membership is revalidated", async () => {
  const { store } = fixture();
  await store.establish(verified);
  await store.setToken("rotated-fixture");
  expect(store.getSnapshot()).toMatchObject({
    status: "loading",
    roles: [],
    activeRole: null,
  });
});
