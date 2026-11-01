import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import type { PersistQueryClientProviderProps } from "@tanstack/react-query-persist-client";
import { ApiError } from "./api";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 24 * 60 * 60 * 1000,
      retry: (count, error) => {
        // Auth and permission problems will not fix themselves on retry.
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) return false;
        return count < 2;
      },
    },
  },
});

const STORAGE_KEY = "schoolhub:query-cache";
export const persister = createAsyncStoragePersister({ storage: AsyncStorage, key: STORAGE_KEY });

/**
 * Only queries that opt in with `meta: { persist: true }` reach disk. The cache
 * is plain AsyncStorage, so never opt in data that is sensitive (reports,
 * fees, personal details). Timetables and announcements are fine.
 */
export const persistOptions: PersistQueryClientProviderProps["persistOptions"] = {
  persister,
  maxAge: 24 * 60 * 60 * 1000,
  buster: "v1",
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => query.state.status === "success" && query.meta?.persist === true,
  },
};

/** Sign-out: drop everything in memory and on disk. */
export async function wipeQueryCache() {
  queryClient.clear();
  await AsyncStorage.removeItem(STORAGE_KEY);
}
