import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { useInfiniteEndpointQuery, type PageEnvelope } from "@/api/pagination";
import type { EndpointQuery } from "@/api/endpoint";

test("page helper passes page numbers, filters and abort signals to list endpoints", async () => {
  const endpoint = jest.fn(
    async ({
      query,
    }: {
      query: EndpointQuery;
      signal?: AbortSignal;
    }): Promise<PageEnvelope<number, { next?: number }>> => ({
      data: [Number(query.page)],
      meta: query.page === 1 ? { next: 2 } : {},
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  const { result, unmount } = await renderHook(
    () =>
      useInfiniteEndpointQuery({
        queryKey: ["paged", "teacher"],
        endpoint,
        query: { classId: "class-1" },
        getNextPage: (page) => page.meta.next,
      }),
    { wrapper: Wrapper },
  );

  try {
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    let nextPages: PageEnvelope<number, { next?: number }>[] | undefined;
    await act(async () => {
      const nextResult = await result.current.fetchNextPage();
      nextPages = nextResult.data?.pages;
    });
    await waitFor(() => expect(endpoint).toHaveBeenCalledTimes(2));
    expect(endpoint).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ query: { classId: "class-1", page: 1 } }),
    );
    expect(endpoint).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ query: { classId: "class-1", page: 2 } }),
    );
    expect(nextPages?.map((page) => page.data)).toEqual([[1], [2]]);
  } finally {
    unmount();
    client.clear();
  }
});
