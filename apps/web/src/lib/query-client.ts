import { MutationCache, QueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/toaster";
import { ApiError, errorText } from "./api";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: {
      /** Toast shown when the mutation succeeds. */
      success?: string;
      /** Set when the screen already shows its own error, so no toast is added. */
      silent?: boolean;
    };
  }
}

/** No point retrying a request the server refused on purpose. */
const NO_RETRY_STATUSES = new Set([401, 403, 404]);

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        retry: (failureCount, error) =>
          !(error instanceof ApiError && NO_RETRY_STATUSES.has(error.status)) && failureCount < 1,
      },
    },
    mutationCache: new MutationCache({
      onSuccess: (_data, _vars, _ctx, mutation) => {
        const message = mutation.meta?.success;
        if (message) toast.success(message);
      },
      onError: (error, _vars, _ctx, mutation) => {
        // Screens that handle their own errors (an onError callback or meta.silent) are left alone.
        if (mutation.meta?.silent || mutation.options.onError) return;
        // 401 is handled by the session-expiry redirect with its own message.
        if (error instanceof ApiError && error.status === 401) return;
        toast.error(errorText(error));
      },
    }),
  });
}
/** Live active-context reference for diagnostics and non-component integrations. */
export let queryClient = createQueryClient();
export function activateQueryClient(client: QueryClient) { queryClient = client; }
