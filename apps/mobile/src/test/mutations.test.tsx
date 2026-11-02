import { renderHook, act, waitFor } from "@testing-library/react-native";
import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useScopedMutation } from "@/features/shared/mutations";
import { sessionStore } from "@/lib/session";
jest.mock("@/lib/session", () => ({
  useSession: jest.fn(() => ({
    status: "ready",
    activeRole: "teacher",
    subdomain: "school",
    token: "fixture-session",
  })),
  sessionStore: { getSnapshot: jest.fn() },
}));
const ready = {
  status: "ready",
  activeRole: "teacher",
  subdomain: "school",
  token: "fixture-session",
};
beforeEach(() => {
  jest.mocked(sessionStore.getSnapshot).mockReturnValue(ready as never);
});
function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}
test("successful writes invalidate only their school/role scope", async () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity },
      mutations: { gcTime: Infinity, retry: false },
    },
  });
  client.setQueryData(["school", "school", "teacher", "announcements"], []);
  client.setQueryData(["school", "other", "teacher", "announcements"], []);
  const { result, unmount } = await renderHook(
    () => useScopedMutation(async (_value: string) => "saved"),
    { wrapper: wrapper(client) },
  );
  await act(async () => {
    await result.current.mutateAsync("fixture");
  });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(
    client.getQueryState(["school", "school", "teacher", "announcements"])
      ?.isInvalidated,
  ).toBe(true);
  expect(
    client.getQueryState(["school", "other", "teacher", "announcements"])
      ?.isInvalidated,
  ).toBe(false);
  await unmount();
  client.clear();
});
test("stale forms cannot submit after account or role changes", async () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity },
      mutations: { gcTime: Infinity, retry: false },
    },
  });
  const mutate = jest.fn(async () => "saved");
  const { result, unmount } = await renderHook(
    () => useScopedMutation(mutate),
    {
      wrapper: wrapper(client),
    },
  );
  jest
    .mocked(sessionStore.getSnapshot)
    .mockReturnValue({ ...ready, token: "different-fixture" } as never);
  await act(async () => {
    await expect(result.current.mutateAsync(undefined)).rejects.toThrow(
      "session has changed",
    );
  });
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(mutate).not.toHaveBeenCalled();
  await unmount();
  client.clear();
});

beforeAll(() => notifyManager.setScheduler(queueMicrotask));
afterAll(() =>
  notifyManager.setScheduler((callback) => setTimeout(callback, 0)),
);
