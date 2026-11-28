import { reopenReportSetSchema, requestMarkCorrectionSchema } from "@schoolhub/shared";
import { describe, expect, it } from "vitest";

describe("reopenReportSetSchema", () => {
  it("accepts a reason and trims it", () => {
    expect(reopenReportSetSchema.parse({ reason: "  A mark was entered against the wrong pupil.  " }))
      .toEqual({ reason: "A mark was entered against the wrong pupil." });
  });

  it("requires a real reason, not a word", () => {
    for (const body of [{}, { reason: "" }, { reason: "oops" }, { reason: "         " }, { reason: 42 }, { reason: null }]) {
      expect(reopenReportSetSchema.safeParse(body).success).toBe(false);
    }
  });

  it("keeps the reason short enough for the audit trail", () => {
    expect(reopenReportSetSchema.safeParse({ reason: "x".repeat(500) }).success).toBe(true);
    expect(reopenReportSetSchema.safeParse({ reason: "x".repeat(501) }).success).toBe(false);
  });
});

describe("requestMarkCorrectionSchema applyNow", () => {
  const base = {
    classId: "c1", subjectId: "s1", templateId: "t1",
    reason: "Marks were transposed for two pupils.",
    items: [{ studentId: "p1", componentId: "k1", marks: 18 }],
  };

  it("keeps applyNow when it is sent, so the service can see and check it", () => {
    // The field used to be missing from the schema, which made zod drop it silently.
    expect(requestMarkCorrectionSchema.parse({ ...base, applyNow: true }).applyNow).toBe(true);
  });

  it("defaults to sending the correction for approval", () => {
    expect(requestMarkCorrectionSchema.parse(base).applyNow).toBe(false);
  });

  it("rejects a non-boolean applyNow instead of treating it as true", () => {
    for (const applyNow of ["true", 1, "yes", null]) {
      expect(requestMarkCorrectionSchema.safeParse({ ...base, applyNow }).success).toBe(false);
    }
  });

  it("still validates the rest of the request", () => {
    expect(requestMarkCorrectionSchema.safeParse({ ...base, applyNow: true, reason: "short" }).success).toBe(false);
    expect(requestMarkCorrectionSchema.safeParse({ ...base, applyNow: true, items: [] }).success).toBe(false);
  });
});
