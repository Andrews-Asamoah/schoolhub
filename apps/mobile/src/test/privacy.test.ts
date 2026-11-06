import { log } from "@/lib/log";
import {
  persistOptions,
  queryClient,
  wipeQueryCache,
} from "@/lib/query-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
test("logging never emits names, credentials, emails, errors or arbitrary codes", () => {
  const spy = jest.spyOn(console, "warn").mockImplementation(() => {});
  log("app.unhandled_error", {
    name: "Private fixture",
    email: "fixture@example.invalid",
    password: "private-fixture",
    token: "private-fixture",
  });
  log("private-fixture@example.invalid" as never);
  expect(spy).toHaveBeenCalledTimes(1);
  expect(spy).toHaveBeenCalledWith(
    "[SchoolHub]",
    "app.unhandled_error",
    "[redacted]",
  );
  spy.mockRestore();
});
test("sensitive or merely opted-in queries cannot reach disk", () => {
  for (const key of ["reports", "fees", "announcements", "timetable"]) {
    queryClient.setQueryDefaults([key], {
      meta: { persist: true, privacy: "public" },
    });
    queryClient.setQueryData([key], "fixture");
    const query = queryClient.getQueryCache().find({ queryKey: [key] })!;
    expect(persistOptions.dehydrateOptions?.shouldDehydrateQuery?.(query)).toBe(
      false,
    );
  }
});
test("scope clearing drops in-memory and persisted caches", async () => {
  queryClient.setQueryData(["reports"], "fixture");
  await wipeQueryCache();
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  expect(AsyncStorage.removeItem).toHaveBeenCalledWith("schoolhub:query-cache");
});

test("paused mutations with sensitive form variables are never persisted", () => {
  expect(
    persistOptions.dehydrateOptions?.shouldDehydrateMutation?.({} as never),
  ).toBe(false);
});
