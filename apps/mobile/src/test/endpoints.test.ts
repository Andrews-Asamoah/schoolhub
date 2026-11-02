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
  const forbidden = defineEndpoint({
    method: "GET",
    path: "/external-exams/results",
    roles: ["teacher"],
    response: z.unknown(),
  });
  await expect(forbidden()).rejects.toThrow("External examinations");
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
