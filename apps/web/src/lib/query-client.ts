import { QueryClient } from "@tanstack/react-query";

/**
 * Shared QueryClient instance.
 * Import this wherever you need direct QueryClient access
 * (e.g. route loaders, mutations outside of React context).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for 60 seconds — avoids refetch on every focus
      staleTime: 60_000,
      // Retry failed requests once before showing an error
      retry: 1,
    },
  },
});
