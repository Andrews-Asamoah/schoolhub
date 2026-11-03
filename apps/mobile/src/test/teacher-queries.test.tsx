import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { useTeacherQuery, teacherKey } from "@/features/teacher/queries";
import { useSession } from "@/lib/session";
jest.mock("@/lib/session", () => ({ useSession: jest.fn() }));
const ready = { status: "ready", activeRole: "teacher", subdomain: "school" };
beforeEach(() => {
  jest.mocked(useSession).mockReturnValue(ready as never);
});
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}
test("teacher data is school and role scoped, never opted into disk persistence", async () => {
  const { client, wrapper } = setup();
  const load = jest.fn(async () => [{ id: "fixture" }]);
  const { result, unmount } = await renderHook(
    () => useTeacherQuery(["register", "class", "2026-11-03"], load),
    { wrapper },
  );
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  const query = client.getQueryCache().getAll()[0];
  expect(query?.queryKey).toEqual(
    teacherKey("school", "register", "class", "2026-11-03"),
  );
  expect(query?.meta?.persist).toBe(false);
  expect(load).toHaveBeenCalledWith(expect.any(AbortSignal));
  await unmount();
  client.clear();
});
test.each(["student", "guardian", "owner", "headteacher"])(
  "%s cannot activate teacher queries",
  async (role) => {
    jest
      .mocked(useSession)
      .mockReturnValue({ ...ready, activeRole: role } as never);
    const { client, wrapper } = setup();
    const load = jest.fn(async () => []);
    const { result, unmount } = await renderHook(
      () => useTeacherQuery(["register"], load),
      { wrapper },
    );
    expect(result.current.isFetching).toBe(false);
    expect(load).not.toHaveBeenCalled();
    await unmount();
    client.clear();
  },
);
