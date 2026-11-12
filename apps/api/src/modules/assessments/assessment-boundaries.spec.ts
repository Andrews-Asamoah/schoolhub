import { BadRequestException } from "@nestjs/common";
import { gradeBoundaryProblems, gradeFromBoundaries, STANINE_SHARES, suggestBoundaries } from "@schoolhub/shared";
import { describe, expect, it } from "vitest";
import { classRankGrades, rankedGrades, type RankBand } from "./assessment-entry.js";
import { AssessmentBoundariesService } from "./assessment-boundaries.service.js";

const cumulative = STANINE_SHARES.reduce<number[]>((all, share) => [...all, (all.at(-1) ?? 0) + share], []);
const grades = cumulative.map((_, index) => String(index + 1));
const bands: RankBand[] = cumulative.map((maxScore, index) => ({
  grade: grades[index]!,
  minScore: index === 0 ? 0 : cumulative[index - 1]!,
  maxScore,
  gradePoint: 9 - index,
}));

/** How many pupils land on each grade under the given boundaries. */
function tally(percentages: number[], boundaries: { grade: string; minScore: number }[]) {
  const minimums = Object.fromEntries(boundaries.map((item) => [item.grade, item.minScore]));
  const counts = grades.map(() => 0);
  for (const percentage of percentages) counts[Number(gradeFromBoundaries(percentage, bands, minimums).grade) - 1]!++;
  return counts;
}

describe("stanine shares", () => {
  it("add up to the BECE cumulative bands", () => {
    expect(cumulative).toEqual([4, 11, 23, 40, 60, 77, 89, 96, 100]);
  });
});

describe("suggestBoundaries", () => {
  it("grades 51 candidates without the 52-slot overshoot of rounding every band on its own", () => {
    const marks = Array.from({ length: 51 }, (_, index) => 92 - index);
    const suggestion = suggestBoundaries(marks, grades, cumulative);
    expect(suggestion).toHaveLength(8);
    const counts = tally(marks, suggestion);
    expect(counts).toEqual([2, 4, 6, 8, 11, 8, 6, 4, 2]);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(51);
  });

  it("puts the top two of 51 in grade 1, as the WAEC worked example does", () => {
    const marks = [92, 79, ...Array.from({ length: 49 }, (_, index) => 78 - index)];
    const [first] = suggestBoundaries(marks, grades, cumulative);
    expect(first).toEqual({ grade: "1", minScore: 79 });
  });

  it("keeps pupils on the same mark together", () => {
    const marks = [90, 80, 80, 80, 70, 60, 60, 50, 40, 30, 20, 10];
    const counts = tally(marks, suggestBoundaries(marks, grades, cumulative));
    const minimums = Object.fromEntries(suggestBoundaries(marks, grades, cumulative).map((item) => [item.grade, item.minScore]));
    expect(new Set([80, 80, 80].map((mark) => gradeFromBoundaries(mark, bands, minimums).grade)).size).toBe(1);
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(12);
  });

  it("lets a grade stay empty in a very small cohort", () => {
    const marks = [88, 74, 61, 55, 40];
    const suggestion = suggestBoundaries(marks, grades, cumulative);
    expect(suggestion[0]!.minScore).toBeGreaterThan(88);
    expect(tally(marks, suggestion)[0]).toBe(0);
  });

  it("always returns boundaries that pass validation, even when everyone scored the same", () => {
    for (const marks of [Array(40).fill(50), Array(7).fill(100), [0, 0, 0], [100]] as number[][]) {
      const suggestion = suggestBoundaries(marks, grades, cumulative);
      expect(gradeBoundaryProblems(grades, suggestion), JSON.stringify(marks)).toEqual([]);
    }
  });

  it("suggests nothing without results", () => {
    expect(suggestBoundaries([], grades, cumulative)).toEqual([]);
  });
});

describe("gradeBoundaryProblems", () => {
  const good = [75, 68, 60, 52, 45, 38, 30, 20].map((minScore, index) => ({ grade: String(index + 1), minScore }));

  it("accepts a full, falling set", () => {
    expect(gradeBoundaryProblems(grades, good)).toEqual([]);
  });

  it("asks for a missing grade", () => {
    expect(gradeBoundaryProblems(grades, good.slice(0, 7))).toEqual(["Enter the minimum mark for grade 8."]);
  });

  it("rejects a boundary for the lowest grade, which takes everything below", () => {
    expect(gradeBoundaryProblems(grades, [...good, { grade: "9", minScore: 5 }])).toEqual(["Grade 9 does not take a boundary."]);
  });

  it("rejects marks that do not fall from grade to grade", () => {
    const wrong = good.map((item) => (item.grade === "3" ? { ...item, minScore: 70 } : item));
    expect(gradeBoundaryProblems(grades, wrong)[0]).toContain("Grade 3");
  });

  it("rejects marks outside 0 to 100", () => {
    const wrong = good.map((item) => (item.grade === "8" ? { ...item, minScore: 0 } : item));
    expect(gradeBoundaryProblems(grades, wrong)[0]).toContain("Grade 8");
  });
});

describe("rankedGrades", () => {
  const class30 = Array.from({ length: 30 }, (_, index) => ({ id: `p${index}`, percentage: 95 - index * 2 }));

  it("without boundaries is the class-ranked stanine", () => {
    expect([...rankedGrades(class30, bands, null)]).toEqual([...classRankGrades(class30, bands)]);
    expect([...rankedGrades(class30, bands, {})]).toEqual([...classRankGrades(class30, bands)]);
  });

  it("with boundaries grades by mark alone, whoever else is in the class", () => {
    const boundaries = { "1": 90, "2": 80, "3": 70, "4": 60, "5": 50, "6": 40, "7": 30, "8": 20 };
    const alone = rankedGrades([{ id: "a", percentage: 72 }], bands, boundaries).get("a");
    const withClass = rankedGrades([...class30, { id: "a", percentage: 72 }], bands, boundaries).get("a");
    expect(alone?.grade).toBe("3");
    expect(withClass).toEqual(alone);
    expect(rankedGrades([{ id: "b", percentage: 19.99 }], bands, boundaries).get("b")).toEqual({ grade: "9", gradePoint: 1 });
  });

  it("treats a mark exactly on a boundary as reaching that grade", () => {
    const boundaries = { "1": 90, "2": 80, "3": 70, "4": 60, "5": 50, "6": 40, "7": 30, "8": 20 };
    expect(rankedGrades([{ id: "a", percentage: 90 }], bands, boundaries).get("a")?.grade).toBe("1");
  });
});

// A small in-memory stand-in for the database, enough to watch regrading happen.
function fakePrisma(options: { method?: "CLASS_RANK" | "SCORE_BANDS"; subjectCode?: string | null } = {}) {
  const scores = [
    { id: "s1", studentId: "st1", percentage: 91, grade: "1", gradePoint: 9 },
    { id: "s2", studentId: "st2", percentage: 74, grade: "2", gradePoint: 8 },
    { id: "s3", studentId: "st3", percentage: 55, grade: "3", gradePoint: 7 },
    { id: "s4", studentId: "st4", percentage: 30, grade: "4", gradePoint: 6 },
  ];
  const saved: { grade: string; minScore: number }[] = [];
  const audit: unknown[] = [];
  const client = {
    assessmentTemplate: {
      findFirst: async () => ({
        id: "t1",
        name: "Mock 1",
        subjectCode: options.subjectCode ?? null,
        gradingSystem: {
          method: options.method ?? "CLASS_RANK",
          gradeScales: bands.map((band, index) => ({ ...band, description: `G${index + 1}`, displayOrder: index + 1 })),
        },
      }),
    },
    subject: { findFirst: async () => ({ id: "sub1", name: "Mathematics", code: "MATH" }) },
    term: { findFirst: async () => ({ id: "term1", name: "Term 1" }) },
    assessmentGradeBoundary: {
      deleteMany: async () => { saved.length = 0; },
      createMany: async ({ data }: { data: { grade: string; minScore: { toString(): string } }[] }) => {
        for (const row of data) saved.push({ grade: row.grade, minScore: Number(row.minScore.toString()) });
      },
      findMany: async () => saved.map((row) => ({ grade: row.grade, minScore: row.minScore })),
    },
    assessmentScore: {
      findMany: async () => scores.map((row) => ({ ...row, percentage: row.percentage })),
      update: async ({ where, data }: { where: { id: string }; data: { grade: string; gradePoint: { toString(): string } } }) => {
        const row = scores.find((item) => item.id === where.id)!;
        row.grade = data.grade;
        row.gradePoint = Number(data.gradePoint.toString());
      },
    },
    enrollment: {
      // two classes of two pupils
      findMany: async () => [
        { studentId: "st1", classId: "A" }, { studentId: "st2", classId: "A" },
        { studentId: "st3", classId: "B" }, { studentId: "st4", classId: "B" },
      ],
    },
    auditLog: { create: async (args: unknown) => { audit.push(args); } },
    $transaction: async (run: (tx: unknown) => unknown) => run(client),
  };
  return { service: new AssessmentBoundariesService({ client } as never), scores, saved, audit };
}

describe("AssessmentBoundariesService", () => {
  const boundaries = [90, 80, 70, 60, 50, 40, 30, 20].map((minScore, index) => ({ grade: String(index + 1), minScore }));

  it("regrades every finished result by mark when boundaries are saved", async () => {
    const { service, scores, saved, audit } = fakePrisma();
    const result = await service.save("school1", "user1", "t1", { subjectId: "sub1", termId: "term1", boundaries });
    expect(scores.map((row) => row.grade)).toEqual(["1", "3", "5", "7"]); // 91, 74, 55, 30 -> graded by mark against the boundaries
    expect(result.regraded).toBe(3);
    expect(result.boundaries).toHaveLength(8);
    expect(saved).toHaveLength(8);
    expect(audit).toHaveLength(1);
  });

  it("goes back to class ranking, class by class, when boundaries are cleared", async () => {
    const { service, scores, saved } = fakePrisma();
    await service.save("school1", "user1", "t1", { subjectId: "sub1", termId: "term1", boundaries });
    const result = await service.clear("school1", "user1", "t1", "sub1", "term1");
    expect(saved).toHaveLength(0);
    expect(result.boundaries).toBeNull();
    // Two pupils per class: the better of each is in the top half of their own class.
    expect(scores.find((row) => row.id === "s1")!.grade).toBe(scores.find((row) => row.id === "s3")!.grade);
    expect(scores.find((row) => row.id === "s2")!.grade).toBe(scores.find((row) => row.id === "s4")!.grade);
  });

  it("refuses boundaries that do not fall from grade to grade", async () => {
    const { service, saved } = fakePrisma();
    const wrong = boundaries.map((item) => (item.grade === "4" ? { ...item, minScore: 85 } : item));
    await expect(service.save("school1", "user1", "t1", { subjectId: "sub1", termId: "term1", boundaries: wrong })).rejects.toBeInstanceOf(BadRequestException);
    expect(saved).toHaveLength(0);
  });

  it("only applies to class-ranked scales", async () => {
    const { service } = fakePrisma({ method: "SCORE_BANDS" });
    await expect(service.get("school1", "t1", "sub1", "term1")).rejects.toThrow(/class-ranked/);
  });

  it("refuses a subject the assessment is not for", async () => {
    const { service } = fakePrisma({ subjectCode: "ENG" });
    await expect(service.get("school1", "t1", "sub1", "term1")).rejects.toThrow(/only for ENG/);
  });
});
