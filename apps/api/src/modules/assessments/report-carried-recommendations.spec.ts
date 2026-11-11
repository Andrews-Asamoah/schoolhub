import { describe, expect, it } from "vitest";
import { carriedRecommendations } from "./report-version.js";

const none = { teacherRemark: null, headRemark: null, carriedTeacherRemark: null, carriedHeadRemark: null };

describe("carriedRecommendations", () => {
  it("carries both signed recommendations from the previous version", () => {
    expect(carriedRecommendations({ ...none, teacherRemark: "Steady progress.", headRemark: "Approved with praise." }))
      .toEqual({ carriedTeacherRemark: "Steady progress.", carriedHeadRemark: "Approved with praise." });
  });

  it("carries nothing for a first version or one that was never recommended", () => {
    const empty = { carriedTeacherRemark: null, carriedHeadRemark: null };
    expect(carriedRecommendations(null)).toEqual(empty);
    expect(carriedRecommendations(undefined)).toEqual(empty);
    expect(carriedRecommendations(none)).toEqual(empty);
  });

  it("keeps the text through a second regeneration when the middle version was never signed", () => {
    // v1 was signed, v2 only carried v1's text, v3 is being created now.
    const v2 = { ...none, carriedTeacherRemark: "Steady progress.", carriedHeadRemark: "Approved with praise." };
    expect(carriedRecommendations(v2)).toEqual({ carriedTeacherRemark: "Steady progress.", carriedHeadRemark: "Approved with praise." });
  });

  it("prefers what was actually signed over older carried text", () => {
    expect(carriedRecommendations({ ...none, teacherRemark: "Newer text.", carriedTeacherRemark: "Older text." }).carriedTeacherRemark).toBe("Newer text.");
  });

  it("carries the teacher's text even when the headteacher had not approved yet", () => {
    expect(carriedRecommendations({ ...none, teacherRemark: "Steady progress." }))
      .toEqual({ carriedTeacherRemark: "Steady progress.", carriedHeadRemark: null });
  });

  it("ignores blank text", () => {
    expect(carriedRecommendations({ ...none, teacherRemark: "   ", carriedTeacherRemark: "Kept." }).carriedTeacherRemark).toBe("Kept.");
  });
});
