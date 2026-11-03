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
  getNextPage: (lastPage: PageEnvelope<TItem, TMeta>) => number | undefined;
};

/** Standard page-number wrapper for endpoints returning `{ data, meta }`. */
export function useInfiniteEndpointQuery<TItem, TMeta>({
  queryKey,
  endpoint,
  query,
  getNextPage,
}: InfiniteEndpointOptions<TItem, TMeta>) {
  return useInfiniteQuery({
    queryKey,
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      endpoint({
        query: { ...query, page: pageParam },
        signal,
      }),
    getNextPageParam: (lastPage) => getNextPage(lastPage),
  });
}
