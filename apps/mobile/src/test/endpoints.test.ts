import { z } from "zod";
import { defineEndpoint } from "@/api/endpoint";
import {
  listAnnouncementClasses,
  listAnnouncements,
  publishClassAnnouncement,
} from "@/api/announcements";
import { listStaffDocuments, shareStaffDocument } from "@/api/documents";
import {
  getCurrentAcademicContext,
  getMyProfile,
  listMessageRecipients,
  listNotifications,
  sendMessage,
  updateMyProfile,
  uploadMyAvatar,
} from "@/api/shared";
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
  jest.mocked(apiFetch).mockReset();
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

test("shared endpoint schemas parse private notifications and academic context", async () => {
  jest.mocked(apiFetch).mockResolvedValueOnce({
    items: [
      {
        id: "notification-1",
        type: "GENERAL",
        title: "Term update",
        message: "The school term has started.",
        link: null,
        isRead: false,
        createdAt: "2026-11-02T00:00:00.000Z",
        privateField: "not needed on mobile",
      },
    ],
    unreadCount: 1,
  });
  const notifications = await listNotifications();
  expect(notifications.items[0]).not.toHaveProperty("privateField");
  jest.mocked(apiFetch).mockResolvedValueOnce(null);
  await expect(getCurrentAcademicContext()).resolves.toBeNull();
});

test("self-profile updates wrap validated input in the endpoint request body", async () => {
  const profile = {
    user: {
      name: "Example Teacher",
      email: "teacher@example.test",
      image: null,
    },
    username: null,
    profile: {
      firstName: "Example",
      lastName: "Teacher",
      otherNames: null,
      phone: null,
      alternatePhone: null,
      residentialAddress: null,
      city: null,
      region: null,
      emergencyContactName: null,
      emergencyContactPhone: null,
      emergencyRelationship: null,
    },
    canEditName: true,
  };
  jest.mocked(apiFetch).mockResolvedValueOnce(profile);
  await expect(getMyProfile()).resolves.toEqual(profile);
  jest.mocked(apiFetch).mockResolvedValueOnce(profile);
  await updateMyProfile({
    request: { phone: "0244123456", city: "Accra" },
  });
  expect(apiFetch).toHaveBeenLastCalledWith(
    "/schools/current/me/profile",
    expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ phone: "0244123456", city: "Accra" }),
    }),
  );
});

test("message endpoints validate the recipient search signal and request body", async () => {
  const abort = new AbortController();
  jest.mocked(apiFetch).mockResolvedValueOnce([]);
  await listMessageRecipients("Ada Lovelace", { signal: abort.signal });
  expect(apiFetch).toHaveBeenLastCalledWith(
    "/messages/recipients?search=Ada+Lovelace",
    expect.objectContaining({ signal: abort.signal }),
  );
  await expect(
    sendMessage({
      request: { recipientIds: [], subject: "x", body: "" },
    }),
  ).rejects.toThrow();
  expect(apiFetch).toHaveBeenCalledTimes(1);
});

test("student accounts cannot call teacher/guardian-only avatar endpoints", async () => {
  jest.mocked(sessionStore.getSnapshot).mockReturnValue({
    ...ready,
    activeRole: "student",
    roles: ["student"],
  } as never);
  await expect(
    uploadMyAvatar({
      file: new Blob(["fixture"]),
      mimeType: "image/jpeg",
    }),
  ).rejects.toThrow("unavailable for the active role");
  expect(apiFetch).not.toHaveBeenCalled();
});

test("avatar uploads enforce their image type and size limits", async () => {
  const image = new Blob(["fixture"]);
  await expect(
    uploadMyAvatar({ file: image, mimeType: "image/svg+xml" }),
  ).rejects.toThrow("JPEG, PNG, or WebP");
  await expect(
    uploadMyAvatar({
      file: new Blob([new Uint8Array(2 * 1024 * 1024 + 1)]),
      mimeType: "image/jpeg",
    }),
  ).rejects.toThrow("under 2 MB");
  expect(apiFetch).not.toHaveBeenCalled();

  jest.mocked(apiFetch).mockResolvedValueOnce({
    image: "https://schoolhub.example.test/avatar.jpg",
  });
  await expect(
    uploadMyAvatar({ file: image, mimeType: "image/jpeg" }),
  ).resolves.toEqual({
    image: "https://schoolhub.example.test/avatar.jpg",
  });
  expect(apiFetch).toHaveBeenLastCalledWith(
    "/schools/current/me/avatar",
    expect.objectContaining({ method: "PUT", body: expect.any(FormData) }),
  );
  const request = jest.mocked(apiFetch).mock.calls.at(-1)?.[1];
  expect((request?.body as FormData).get("avatar")).toMatchObject({
    type: "image/jpeg",
  });
});

test("idempotency keys are only accepted by endpoints that declare them, and are validated", async () => {
  jest.mocked(apiFetch).mockResolvedValue({ ok: true });
  const plain = defineEndpoint({
    method: "POST",
    path: "/attendance/batch",
    roles: ["teacher"],
    request: z.object({ a: z.number() }),
    response: z.unknown(),
  });
  await expect(
    plain({ request: { a: 1 }, idempotencyKey: "reg-aaaaaaaa" }),
  ).rejects.toThrow("does not accept an idempotency key");
  const idem = defineEndpoint({
    method: "POST",
    path: "/attendance/batch",
    roles: ["teacher"],
    idempotent: true,
    request: z.object({ a: z.number() }),
    response: z.unknown(),
  });
  await expect(
    idem({ request: { a: 1 }, idempotencyKey: "short" }),
  ).rejects.toThrow("Invalid idempotency key");
  await expect(
    idem({ request: { a: 1 }, idempotencyKey: "bad key with spaces" }),
  ).rejects.toThrow("Invalid idempotency key");
  expect(apiFetch).not.toHaveBeenCalled();
  await idem({ request: { a: 1 }, idempotencyKey: "reg-aaaaaaaa" });
  expect(apiFetch).toHaveBeenCalledWith(
    "/attendance/batch",
    expect.objectContaining({ headers: { "Idempotency-Key": "reg-aaaaaaaa" } }),
  );
  await idem({ request: { a: 1 } });
  expect(jest.mocked(apiFetch).mock.calls[1]![1]).not.toHaveProperty("headers");
  expect(() =>
    defineEndpoint({
      method: "GET",
      path: "/attendance/class/:classId",
      roles: ["teacher"],
      idempotent: true,
      response: z.unknown(),
    }),
  ).toThrow("Only write endpoints");
});

test("teacher announcement publishing limits writes to selected classes and their guardians", async () => {
  const notice = {
    title: "Class trip",
    content: "Meet on Friday.",
    category: "GENERAL" as const,
  };
  await expect(
    publishClassAnnouncement({
      request: { ...notice, target: "SELECTED_CLASSES", classIds: [] },
    }),
  ).rejects.toThrow();
  await expect(
    publishClassAnnouncement({
      request: {
        ...notice,
        target: "SCHOOL_COMMUNITY" as never,
        classIds: ["class-a"],
      },
    }),
  ).rejects.toThrow();
  expect(apiFetch).not.toHaveBeenCalled();

  jest.mocked(apiFetch).mockResolvedValue({
    ...notice,
    id: "notice-a",
    target: "SELECTED_CLASS_GUARDIANS",
    isPinned: false,
    status: "PUBLISHED",
    createdAt: "2026-11-02T00:00:00.000Z",
  });
  await publishClassAnnouncement({
    request: {
      ...notice,
      target: "SELECTED_CLASS_GUARDIANS",
      classIds: ["class-a"],
    },
  });
  expect(apiFetch).toHaveBeenCalledWith(
    "/announcements",
    expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"classIds":["class-a"]'),
    }),
  );
});

test("guardian sessions cannot open teacher announcement or document APIs", async () => {
  jest.mocked(sessionStore.getSnapshot).mockReturnValue({
    ...ready,
    activeRole: "guardian",
    roles: ["guardian"],
  } as never);
  await expect(listAnnouncementClasses()).rejects.toThrow();
  await expect(listStaffDocuments()).rejects.toThrow();
  await expect(shareStaffDocument({ params: { id: "doc" } })).rejects.toThrow();
  expect(apiFetch).not.toHaveBeenCalled();
});

test("staff document listing strips server URLs and keeps paginated metadata", async () => {
  jest.mocked(apiFetch).mockResolvedValue({
    data: [
      {
        id: "doc",
        title: "Staff handbook",
        description: null,
        fileType: "application/pdf",
        storageReady: true,
        fileUrl: "https://storage.example.test/doc",
        storageKey: "private-key",
      },
    ],
    meta: { page: 2, totalPages: 3 },
  });
  const result = await listStaffDocuments({
    query: { search: "handbook", page: 2 },
  });
  expect(apiFetch).toHaveBeenCalledWith(
    "/documents?search=handbook&page=2",
    expect.anything(),
  );
  expect(result.meta).toEqual({ page: 2, totalPages: 3 });
  expect(result.data[0]).not.toHaveProperty("fileUrl");
  expect(result.data[0]).not.toHaveProperty("storageKey");
});
