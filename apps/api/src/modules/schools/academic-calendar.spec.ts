import { describe, expect, it } from "vitest";
import { findOverlappingTerm, termProblemWithinYear, termsOutsideYear } from "./academic-calendar.js";

const year = { startDate: "2026-09-01", endDate: "2027-07-31" };

describe("termProblemWithinYear", () => {
  it("accepts a term inside the year", () => {
    expect(termProblemWithinYear(year, { startDate: "2026-09-08", endDate: "2026-12-18" })).toBeNull();
  });
  it("rejects a term that ends before it starts", () => {
    expect(termProblemWithinYear(year, { startDate: "2026-12-18", endDate: "2026-09-08" })).toMatch(/end after/);
  });
  it("rejects a term outside the year", () => {
    expect(termProblemWithinYear(year, { startDate: "2026-08-20", endDate: "2026-12-18" })).toMatch(/inside the academic year/);
  });
});

describe("findOverlappingTerm", () => {
  const terms = [
    { id: "t1", name: "Term 1", startDate: "2026-09-08", endDate: "2026-12-18" },
    { id: "t2", name: "Term 2", startDate: "2027-01-10", endDate: "2027-04-02" },
  ];
  it("finds an overlap and ignores the term being edited", () => {
    expect(findOverlappingTerm(terms, { startDate: "2026-12-01", endDate: "2027-01-20" })?.name).toBe("Term 1");
    expect(findOverlappingTerm(terms, { id: "t1", startDate: "2026-09-10", endDate: "2026-12-10" })).toBeUndefined();
  });
  it("allows a non-overlapping term", () => {
    expect(findOverlappingTerm(terms, { startDate: "2027-04-20", endDate: "2027-07-20" })).toBeUndefined();
  });
});

describe("termsOutsideYear", () => {
  it("lists terms that fall outside a shortened year", () => {
    const terms = [{ startDate: "2026-09-08", endDate: "2026-12-18" }, { startDate: "2027-05-01", endDate: "2027-07-20" }];
    expect(termsOutsideYear(terms, { startDate: "2026-09-01", endDate: "2027-03-31" })).toHaveLength(1);
  });
});
