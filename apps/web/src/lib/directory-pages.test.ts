import { describe, expect, it, vi } from "vitest";
import { loadDirectoryPages, type DirectoryPage } from "./directory-pages";

const page = (number: number, totalPages = 3): DirectoryPage<number> => ({
  data: [number], meta: { page: number, limit: 100, total: totalPages, totalPages },
});

describe("complete directory loading", () => {
  it("includes records beyond the first API page in order for table search and exports", async () => {
    const fetchPage = vi.fn(async (number: number) => page(number));
    const result = await loadDirectoryPages(fetchPage);
    expect(result.data).toEqual([1, 2, 3]);
    expect(fetchPage.mock.calls.map(([number]) => number)).toEqual([1, 2, 3]);
    expect(result.meta).toEqual({ page: 1, limit: 3, total: 3, totalPages: 1 });
  });

  it("limits concurrent requests to four and preserves page order", async () => {
    let active = 0;
    let peak = 0;
    const result = await loadDirectoryPages(async (number) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, number % 2));
      active--;
      return page(number, 10);
    });
    expect(peak).toBe(4);
    expect(result.data).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("does not show an incomplete directory when a later page fails", async () => {
    await expect(loadDirectoryPages(async (number) => {
      if (number === 2) throw new Error("Network unavailable");
      return page(number);
    })).rejects.toThrow("Network unavailable");
  });

  it("stops loading further pages after a filter change cancels the query", async () => {
    const controller = new AbortController();
    const fetchPage = vi.fn(async (number: number) => {
      controller.abort();
      return page(number);
    });
    await expect(loadDirectoryPages(fetchPage, controller.signal)).rejects.toThrow();
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("handles an empty directory without requesting extra pages", async () => {
    const fetchPage = vi.fn(async () => ({ ...page(1, 0), data: [] }));
    expect((await loadDirectoryPages(fetchPage)).data).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
