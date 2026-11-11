import { describe, expect, it } from "vitest";
import { archiveQueryString } from "./report-card-archive-workspace";

const none = { page: 1, q: "", yearId: "", termId: "", classId: "" };

describe("archiveQueryString", () => {
  it("asks only for the page when nothing is filtered", () => {
    expect(archiveQueryString(none)).toBe("page=1&pageSize=25");
  });

  it("sends each filter under the name the API expects", () => {
    const params = new URLSearchParams(archiveQueryString({ page: 3, q: "ama", yearId: "y1", termId: "t2", classId: "c9" }));
    expect(Object.fromEntries(params)).toEqual({ page: "3", pageSize: "25", q: "ama", academicYearId: "y1", termId: "t2", classId: "c9" });
  });

  it("trims the search and leaves out a blank one", () => {
    expect(new URLSearchParams(archiveQueryString({ ...none, q: "  ama mensah  " })).get("q")).toBe("ama mensah");
    expect(new URLSearchParams(archiveQueryString({ ...none, q: "   " })).has("q")).toBe(false);
  });

  it("encodes characters that would break the query", () => {
    const query = archiveQueryString({ ...none, q: "a&b=c" });
    expect(query).not.toContain("a&b");
    expect(new URLSearchParams(query).get("q")).toBe("a&b=c");
  });
});
