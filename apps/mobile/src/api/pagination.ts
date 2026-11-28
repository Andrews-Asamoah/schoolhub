import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";
import type { EndpointQuery } from "./endpoint";

export type PageEnvelope<TItem, TMeta> = {
  data: TItem[];
  meta: TMeta;
};

type InfiniteEndpointOptions<TItem, TMeta> = {
  queryKey: QueryKey;
  endpoint: (options: {
    query: EndpointQuery;
    signal?: AbortSignal;
  }) => Promise<PageEnvelope<TItem, TMeta>>;
  query?: EndpointQuery;
  enabled?: boolean;
  getNextPage: (lastPage: PageEnvelope<TItem, TMeta>) => number | undefined;
};

/** Standard page-number wrapper for endpoints returning `{ data, meta }`. */
export function useInfiniteEndpointQuery<TItem, TMeta>({
  queryKey,
  endpoint,
  query,
  enabled,
  getNextPage,
}: InfiniteEndpointOptions<TItem, TMeta>) {
  return useInfiniteQuery({
    queryKey,
    enabled,
    meta: { persist: false },
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      endpoint({
        query: { ...query, page: pageParam },
        signal,
      }),
    getNextPageParam: (lastPage) => getNextPage(lastPage),
  });
}
