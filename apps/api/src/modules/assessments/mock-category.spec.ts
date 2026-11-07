import { describe, expect, it } from "vitest";
import { MOCK_COMPONENT_DEFAULT, saveAssessmentTemplateSchema } from "@schoolhub/shared";
import { componentTypeFor, mockFields } from "./assessment-setup.service.js";

const base = { name: "Mock 1", gradingSystemId: "g1", classIds: ["c1"], isActive: true, isLocked: false, components: [{ ...MOCK_COMPONENT_DEFAULT }] };

describe("mock assessments", () => {
  it("accepts a standard mock: one total out of 100 inside an academic year", () => {
    const parsed = saveAssessmentTemplateSchema.safeParse({ ...base, category: "MOCK", academicYearId: "y1", sequence: 1 });
    expect(parsed.success).toBe(true);
  });

  it("requires an academic year for a mock", () => {
    const parsed = saveAssessmentTemplateSchema.safeParse({ ...base, category: "MOCK" });
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("academic year");
  });

  it("rejects a repeating component on a mock", () => {
    const parsed = saveAssessmentTemplateSchema.safeParse({ ...base, category: "MOCK", academicYearId: "y1", components: [{ ...MOCK_COMPONENT_DEFAULT, isRepeatable: true, expectedCount: 2 }] });
    expect(parsed.success).toBe(false);
  });

  it("still defaults existing payloads to termly with no year", () => {
    const parsed = saveAssessmentTemplateSchema.parse({ ...base, name: "Termly", components: [{ ...MOCK_COMPONENT_DEFAULT, componentType: "FINAL_EXAM" }] });
    expect(parsed.category).toBe("TERMLY");
  });

  it("stores year and order only for mocks, and records them against the mock component type", () => {
    expect(mockFields({ category: "TERMLY", academicYearId: "y1", sequence: 3 })).toEqual({ category: "TERMLY", academicYearId: null, sequence: null });
    expect(mockFields({ category: "MOCK", academicYearId: "y1", sequence: 2 })).toEqual({ category: "MOCK", academicYearId: "y1", sequence: 2 });
    expect(componentTypeFor({ category: "MOCK" }, "CLASS_TEST")).toBe("MOCK_EXAM");
    expect(componentTypeFor({ category: "TERMLY" }, "CLASS_TEST")).toBe("CLASS_TEST");
  });
});
