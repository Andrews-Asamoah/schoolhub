import { z } from "zod";
import { defineEndpoint } from "@/api/endpoint";
import { listAnnouncements } from "@/api/announcements";
import { apiFetch } from "@/lib/api";
import { sessionStore } from "@/lib/session";
jest.mock("@/lib/api", () => ({ apiFetch: jest.fn() }));
jest.mock("@/lib/session", () => ({
  sessionStore: { getSnapshot: jest.fn() },
}));
const ready = {
  status: "ready",
  activeRole: "teacher",
  roles: ["teacher"],
  token: "fixture-session",
  subdomain: "school",
};
beforeEach(() => {
  jest.mocked(sessionStore.getSnapshot).mockReturnValue(ready as never);
});
test("unauthenticated, blocked and unsupported role calls fail before the transport", async () => {
  for (const state of [
    { ...ready, token: null },
    { ...ready, status: "needsPasswordChange" },
    { ...ready, activeRole: "admin" },
  ]) {
    jest.mocked(sessionStore.getSnapshot).mockReturnValue(state as never);
    await expect(listAnnouncements()).rejects.toThrow();
  }
  expect(apiFetch).not.toHaveBeenCalled();
});
test("schemas reject malformed responses and strip unneeded personal fields", async () => {
  jest.mocked(apiFetch).mockResolvedValue([
    {
      id: "fixture",
      title: "Notice",
      content: "School notice",
      category: "GENERAL",
      target: "ALL",
      status: "PUBLISHED",
      isPinned: false,
      createdAt: "2026-11-02T00:00:00.000Z",
      author: { name: "Private fixture" },
    },
  ]);
  const result = await listAnnouncements();
  expect(result[0]).not.toHaveProperty("author");
  jest.mocked(apiFetch).mockResolvedValue([{ id: 7 }]);
  await expect(listAnnouncements()).rejects.toThrow();
});
test("BECE guard applies in executable paths, even to teacher sessions", async () => {
  expect(() =>
    defineEndpoint({
      method: "GET",
      path: "/external-exams/results",
      roles: ["teacher"],
      response: z.unknown(),
    }),
  ).toThrow("External examinations");
  expect(apiFetch).not.toHaveBeenCalled();
});
test("encodes path parameters and forwards abort signals", async () => {
  const endpoint = defineEndpoint({
    method: "GET",
    path: "/academics/classes/:id/students",
    roles: ["teacher"],
    response: z.array(z.unknown()),
  });
  jest.mocked(apiFetch).mockResolvedValue([]);
  const controller = new AbortController();
  await endpoint({ params: { id: "a/b" }, signal: controller.signal });
  expect(apiFetch).toHaveBeenCalledWith(
    "/academics/classes/a%2Fb/students",
    expect.objectContaining({ signal: controller.signal }),
  );
});

test("validates request bodies before making a protected request", async () => {
  const endpoint = defineEndpoint({
    method: "POST",
    path: "/announcements",
    roles: ["teacher"],
    request: z.object({ title: z.string().min(2) }),
    response: z.object({ id: z.string() }),
  });
  await expect(endpoint({ request: { title: "" } })).rejects.toThrow();
  expect(apiFetch).not.toHaveBeenCalled();
});

test("supports POST, PUT, PATCH and DELETE requests", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
    const endpoint = defineEndpoint({
      method,
      path: "/announcements",
      roles: ["teacher"],
      request: z.object({ title: z.string() }),
      response: z.object({ success: z.boolean() }),
    });
    jest.mocked(apiFetch).mockResolvedValue({ success: true });
    await endpoint({ request: { title: "Term update" } });
    expect(apiFetch).toHaveBeenLastCalledWith(
      "/announcements",
      expect.objectContaining({
        method,
        body: JSON.stringify({ title: "Term update" }),
      }),
    );
  }
});

test("serializes query values with URLSearchParams", async () => {
  const endpoint = defineEndpoint({
    method: "GET",
    path: "/academics/classes/:id/students",
    roles: ["teacher"],
    response: z.array(z.unknown()),
  });
  jest.mocked(apiFetch).mockResolvedValue([]);
  await endpoint({
    params: { id: "class/a b" },
    query: {
      search: "A & B",
      active: true,
      skip: null,
      tag: ["one two", "x/y"],
    },
  });
  expect(apiFetch).toHaveBeenCalledWith(
    "/academics/classes/class%2Fa%20b/students?search=A+%26+B&active=true&tag=one+two&tag=x%2Fy",
    expect.objectContaining({ method: "GET" }),
  );
});
