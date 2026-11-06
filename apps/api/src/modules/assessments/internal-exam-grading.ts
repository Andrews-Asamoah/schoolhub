import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { gradeForPercentage, snapshotHash, validateBands, type GradeBand } from "./mock-report.js";

export interface MockEntryGrading {
  name: string;
  bands: GradeBand[];
  source: "REPORT" | "SCHOOL_DEFAULT" | "SYSTEM_DEFAULT";
}
const policySchema = z.object({ grading: z.object({
  name: z.string().min(1),
  bands: z.array(z.object({ grade: z.string().min(1), min: z.number().finite(), max: z.number().finite(), description: z.string() })),
}) });

/** Use the frozen report policy once generated; before then label the default as a preview. */
export async function resolveMockEntryGrading(
  db: Pick<PrismaClient, "internalMockReport" | "gradingSystem">,
  schoolId: string,
  sessionId: string,
): Promise<{ grading: MockEntryGrading | null; gradingMessage: string | null }> {
  const report = await db.internalMockReport.findFirst({
    where: { schoolId, sessionId }, orderBy: [{ version: "desc" }, { createdAt: "desc" }],
    select: { snapshot: true, snapshotHash: true },
  });
  let grading: MockEntryGrading;
  if (report) {
    const parsed = policySchema.safeParse(report.snapshot);
    if (!parsed.success || snapshotHash(report.snapshot) !== report.snapshotHash) {
      return { grading: null, gradingMessage: "The saved report grading policy could not be verified. Contact school management." };
    }
    grading = { ...parsed.data.grading, source: "REPORT" };
  } else {
    const select = { name: true, gradeScales: { orderBy: { displayOrder: "asc" as const }, select: {
      grade: true, minScore: true, maxScore: true, description: true,
    } } };
    const school = await db.gradingSystem.findFirst({
      where: { schoolId, isActive: true, isSchoolDefault: true, method: "SCORE_BANDS" }, orderBy: [{ name: "asc" }, { id: "asc" }], select,
    });
    const system = school ? null : await db.gradingSystem.findFirst({
      where: { schoolId: null, isActive: true, isSystemDefault: true, method: "SCORE_BANDS" }, orderBy: [{ name: "asc" }, { id: "asc" }], select,
    });
    const policy = school ?? system;
    if (!policy) return { grading: null, gradingMessage: "School management must configure a default score-based grading scale to preview mock grades and remarks." };
    grading = { name: policy.name, source: school ? "SCHOOL_DEFAULT" : "SYSTEM_DEFAULT", bands: policy.gradeScales.map((band) => ({
      grade: band.grade, min: Number(band.minScore), max: Number(band.maxScore), description: band.description,
    })) };
  }
  try { validateBands(grading.bands); }
  catch { return { grading: null, gradingMessage: "The grading scale has gaps or overlaps. School management must correct it before grades and remarks can be shown." }; }
  return { grading, gradingMessage: null };
}

/** Match report generation: round the saved whole-paper percentage to the nearest whole point. */
export function mockEntryGrade(percentage: number | null, grading: MockEntryGrading | null) {
  if (percentage === null || !grading) return { grade: null, remark: null };
  const grade = gradeForPercentage(percentage, grading.bands);
  return { grade, remark: grading.bands.find((band) => band.grade === grade)?.description ?? null };
}
