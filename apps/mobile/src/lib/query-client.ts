import AsyncStorage from "@react-native-async-storage/async-storage";
import { clearRegisterQueue } from "./register-queue";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import type { PersistQueryClientProviderProps } from "@tanstack/react-query-persist-client";
import { ApiError, SessionChangedError } from "./api-error";

export const queryClient = new QueryClient({
  defaultOptions: {
    mutations: { retry: false, networkMode: "always" },
    queries: {
      staleTime: 60_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: (count, error) => {
        if (error instanceof SessionChangedError) return false;
        // Auth and permission problems will not fix themselves on retry.
        if (error instanceof ApiError && [401, 403, 404].includes(error.status))
          return false;
        return count < 2;
      },
    },
  },
});

const STORAGE_KEY = "schoolhub:query-cache";
export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: STORAGE_KEY,
});

/**
 * Only queries that opt in with `meta: { persist: true }` reach disk. The cache
 * is plain AsyncStorage, so never opt in data that is sensitive (reports,
 * fees, personal details). Only explicitly public school metadata is currently approved; role-specific announcements and timetables are not persisted by default.
 */
export const persistOptions: PersistQueryClientProviderProps["persistOptions"] =
  {
    persister,
    maxAge: 24 * 60 * 60 * 1000,
    buster: "three-role-v1",
    dehydrateOptions: {
      shouldDehydrateMutation: () => false,
      shouldDehydrateQuery: (query) =>
        query.state.status === "success" &&
        query.meta?.persist === true &&
        query.meta?.privacy === "public" &&
        query.queryKey[0] === "public-school",
    },
  };

/** Sign-out: drop everything in memory and on disk. */
export async function wipeQueryCache() {
  await queryClient.cancelQueries();
  queryClient.clear();
  await AsyncStorage.removeItem(STORAGE_KEY);
  // Queued offline registers belong to the signed-in teacher and school.
  await clearRegisterQueue();
}
