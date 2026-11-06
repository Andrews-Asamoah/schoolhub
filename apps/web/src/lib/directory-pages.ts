export interface DirectoryPage<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

/** Load a complete filtered directory for the shared table's search, sort and export.
 * Keep API page limits and bound concurrency, including for large schools.
 * Callers pass the query's AbortSignal to their fetcher so filter changes cancel work.
 */
export async function loadDirectoryPages<T>(
  fetchPage: (page: number) => Promise<DirectoryPage<T>>,
  signal?: AbortSignal,
): Promise<DirectoryPage<T>> {
  signal?.throwIfAborted();
  const first = await fetchPage(1);
  const pages = [first];
  for (let page = 2; page <= first.meta.totalPages; page += 4) {
    signal?.throwIfAborted();
    pages.push(...await Promise.all(
      Array.from({ length: Math.min(4, first.meta.totalPages - page + 1) }, (_, offset) => fetchPage(page + offset)),
    ));
  }
  signal?.throwIfAborted();
  const data = pages.flatMap((result) => result.data);
  return { data, meta: { ...first.meta, page: 1, limit: data.length, totalPages: data.length ? 1 : 0 } };
}
