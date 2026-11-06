import { describe, expect, it } from "vitest";
import { marksImportColumns, normalizeMarksImportKey } from "@schoolhub/shared";
import { describeChange, identityField, identityKey, lookupColumns, parseMarkCell } from "./assessment-marks-import.js";

describe("parseMarkCell", () => {
  it("treats an empty or blank cell as no change, never zero", () => {
    expect(parseMarkCell("", 20)).toEqual({ kind: "empty" });
    expect(parseMarkCell("  \u00a0 ", 20)).toEqual({ kind: "empty" });
  });

  it("accepts whole marks, decimals and the limits", () => {
    expect(parseMarkCell("0", 20)).toEqual({ kind: "mark", value: 0 });
    expect(parseMarkCell("20", 20)).toEqual({ kind: "mark", value: 20 });
    expect(parseMarkCell(" 12.5 ", 20)).toEqual({ kind: "mark", value: 12.5 });
    expect(parseMarkCell("7.25", 20)).toEqual({ kind: "mark", value: 7.25 });
  });

  it("reads a comma decimal but not a thousands separator", () => {
    expect(parseMarkCell("12,5", 20)).toEqual({ kind: "mark", value: 12.5 });
    expect(parseMarkCell("1,200", 2000).kind).toBe("invalid");
  });

  it.each(["abc", "ABS", "12 marks", "1e3", "--4", "5/10"])("refuses %s as not a number", (text) => {
    const result = parseMarkCell(text, 20);
    expect(result.kind).toBe("invalid");
  });

  it("refuses marks outside 0 to the maximum", () => {
    expect(parseMarkCell("21", 20)).toMatchObject({ kind: "invalid", message: "21 is outside 0 to 20." });
    expect(parseMarkCell("-1", 20).kind).toBe("invalid");
  });

  it("refuses more than two decimal places instead of rounding silently", () => {
    expect(parseMarkCell("7.255", 20)).toMatchObject({ kind: "invalid" });
  });
});

describe("marks import columns", () => {
  const components = [
    { id: "ct", name: "Class Test", maxMarks: 20, slots: 3 },
    { id: "exam", name: "Exam", maxMarks: 100, slots: 1 },
    { id: "prac", name: "Practical", maxMarks: 30, slots: 1, subjectStrandName: "Hardware" },
  ];

  it("gives a repeatable component one column per entry and a single one just its name", () => {
    expect(marksImportColumns(components).map((column) => column.header)).toEqual([
      "Class Test 1 (out of 20)",
      "Class Test 2 (out of 20)",
      "Class Test 3 (out of 20)",
      "Exam (out of 100)",
      "Practical – Hardware (out of 30)",
    ]);
  });

  it("numbers entries from zero for the server", () => {
    expect(marksImportColumns(components).slice(0, 3).map((column) => column.occurrenceIndex)).toEqual([0, 1, 2]);
  });

  it("matches a written heading to its column regardless of case, spacing or the out-of suffix", () => {
    const { byKey, ambiguous } = lookupColumns(marksImportColumns(components));
    expect(ambiguous.size).toBe(0);
    for (const heading of ["Class Test 2 (out of 20)", "class test 2", "CLASS  TEST 2 (out of 20.0)", "Class-Test 2"]) {
      expect(byKey.get(normalizeMarksImportKey(heading))?.occurrenceIndex).toBe(1);
    }
    // Someone retyping the en dash as a hyphen still lands on the right column.
    expect(byKey.get(normalizeMarksImportKey("Practical - Hardware (out of 30)"))?.componentId).toBe("prac");
    expect(byKey.get(normalizeMarksImportKey("Practical"))).toBeUndefined();
  });

  it("flags two columns that would share a heading", () => {
    const { ambiguous } = lookupColumns(
      marksImportColumns([
        { id: "a", name: "Quiz", maxMarks: 10, slots: 1 },
        { id: "b", name: "quiz", maxMarks: 10, slots: 1 },
      ]),
    );
    expect(ambiguous.has("quiz")).toBe(true);
  });
});

describe("identity helpers", () => {
  it("recognises the template's own headings and common spellings", () => {
    expect(identityField("Admission No")).toBe("admission");
    expect(identityField("admission number")).toBe("admission");
    expect(identityField("Pupil name")).toBe("name");
    expect(identityField("Student Name")).toBe("name");
    expect(identityField("Class Test 1 (out of 20)")).toBeNull();
  });

  it("compares names and admission numbers loosely", () => {
    expect(identityKey("  Ama   MENSAH ")).toBe(identityKey("ama mensah"));
    expect(identityKey("Akosúa")).toBe(identityKey("akosua"));
    expect(identityKey("ADM/001")).toBe(identityKey("adm 001"));
  });

  it("describes a new mark and a changed mark", () => {
    expect(describeChange("Exam", null, 70)).toBe("Exam: 70");
    expect(describeChange("Exam", 65, 70)).toBe("Exam: 65 → 70");
  });
});
