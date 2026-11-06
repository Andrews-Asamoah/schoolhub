import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { useNotificationsQuery } from "@/features/shared/queries";

const mockListNotifications = jest.fn();
const mockUseSession = jest.fn();

jest.mock("@/api/shared", () => ({
  getCurrentAcademicContext: jest.fn(),
  getCurrentSession: jest.fn(),
  getMyProfile: jest.fn(),
  getNotificationPreferences: jest.fn(),
  listDeliveryHistory: jest.fn(),
  listInboxMessages: jest.fn(),
  listMessageRecipients: jest.fn(),
  listNotificationHistory: jest.fn(),
  listNotifications: (...args: unknown[]) => mockListNotifications(...args),
  listSentMessages: jest.fn(),
}));
jest.mock("@/lib/permissions", () => ({
  isMobileRole: (value: unknown) =>
    ["teacher", "student", "guardian"].includes(String(value)),
}));
jest.mock("@/lib/session", () => ({
  useSession: (...args: unknown[]) => mockUseSession(...args),
}));

const readySession = {
  status: "ready",
  subdomain: "school",
  activeRole: "teacher",
};

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity, retry: false },
      mutations: { gcTime: Infinity, retry: false },
    },
  });
}

beforeEach(() => {
  mockListNotifications.mockReset();
  mockUseSession.mockReset().mockReturnValue(readySession);
});

test("notification queries are private, role-scoped, and return successful data", async () => {
  mockListNotifications.mockResolvedValue({
    items: [],
    unreadCount: 0,
  });
  const client = createClient();
  const { result, unmount } = await renderHook(() => useNotificationsQuery(), {
    wrapper: createWrapper(client),
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual({ items: [], unreadCount: 0 });
  const query = client.getQueryCache().getAll()[0];
  expect(query?.queryKey).toEqual([
    "school",
    "school",
    "teacher",
    "shared",
    "notifications",
  ]);
  expect(query?.meta?.persist).toBe(false);
  expect(mockListNotifications).toHaveBeenCalledTimes(1);

  await unmount();
  client.clear();
});

test("notification query errors remain visible for retry UI", async () => {
  mockListNotifications.mockRejectedValue(new Error("network unavailable"));
  const client = createClient();
  const { result, unmount } = await renderHook(() => useNotificationsQuery(), {
    wrapper: createWrapper(client),
  });

  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(result.current.error).toEqual(new Error("network unavailable"));

  await unmount();
  client.clear();
});

test("non-mobile role contexts do not issue shared requests", async () => {
  mockUseSession.mockReturnValue({
    ...readySession,
    activeRole: "owner",
  });
  const client = createClient();
  const { result, unmount } = await renderHook(() => useNotificationsQuery(), {
    wrapper: createWrapper(client),
  });

  expect(result.current.isFetching).toBe(false);
  expect(mockListNotifications).not.toHaveBeenCalled();

  await unmount();
  client.clear();
});
