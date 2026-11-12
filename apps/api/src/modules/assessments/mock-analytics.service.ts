import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { TeacherScopeService } from "../../common/scope/teacher-scope.service.js";
import { teachingPairs } from "../../common/scope/teacher-access.js";
import { REPORTABLE_SCORE_STATUSES } from "./assessment-entry.js";
import { buildMockAnalytics, type MockScoreRow } from "./mock-analytics.js";

const MANAGEMENT = new Set(["owner", "admin", "headteacher"]);

@Injectable()
export class MockAnalyticsService {
  constructor(private readonly prisma: PrismaService, private readonly scope: TeacherScopeService) {}

  /**
   * Years and classes that have at least one mock, for the page filters. A mock with no classes
   * picked applies to every class of its year, so those classes are offered too; otherwise a mock
   * made for "all classes" would leave the class list empty and the page blank.
   */
  async options(schoolId: string) {
    const db = this.prisma.client;
    const mocks = await db.assessmentTemplate.findMany({
      where: { schoolId, category: "MOCK" },
      select: { academicYearId: true, classes: { select: { classId: true } } },
    });
    const withYear = mocks.filter((m): m is typeof m & { academicYearId: string } => !!m.academicYearId);
    const yearIds = [...new Set(withYear.map((m) => m.academicYearId))];
    const openYearIds = [...new Set(withYear.filter((m) => m.classes.length === 0).map((m) => m.academicYearId))];
    const explicitClassIds = [...new Set(withYear.flatMap((m) => m.classes.map((c) => c.classId)))];
    const [years, classes] = await Promise.all([
      db.academicYear.findMany({ where: { schoolId, id: { in: yearIds } }, orderBy: { startDate: "desc" }, select: { id: true, name: true, isCurrent: true } }),
      db.class.findMany({
        where: {
          schoolId, deletedAt: null,
          OR: [{ id: { in: explicitClassIds } }, ...(openYearIds.length ? [{ academicYearId: { in: openYearIds } }] : [])],
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true, academicYearId: true },
      }),
    ]);
    return {
      years,
      // yearIds = the years in which this class has a mock, so the page can filter on what is really there.
      classes: classes.map((klass) => ({
        ...klass,
        yearIds: yearIds.filter((yearId) => withYear.some((m) => m.academicYearId === yearId && (m.classes.length ? m.classes.some((c) => c.classId === klass.id) : klass.academicYearId == null || klass.academicYearId === yearId))),
      })).filter((klass) => klass.yearIds.length > 0),
    };
  }

  async analyse(schoolId: string, userId: string, role: string | undefined, input: { academicYearId: string; classId: string; includeDrafts: boolean }) {
    const db = this.prisma.client;
    const [year, klass] = await Promise.all([
      db.academicYear.findFirst({ where: { id: input.academicYearId, schoolId }, select: { id: true, name: true } }),
      db.class.findFirst({ where: { id: input.classId, schoolId, deletedAt: null }, select: { id: true, name: true } }),
    ]);
    if (!year || !klass) throw new BadRequestException("Choose an academic year and class from this school.");

    // Management sees everything. A teacher sees the class they lead in full, or only the
    // subjects they teach in it.
    let allowedSubjects: Set<string> | null = null;
    if (!MANAGEMENT.has(role ?? "")) {
      const assigned = await this.scope.getAssignments(schoolId, userId);
      if (!assigned.teacherId) throw new ForbiddenException("You don't have access to mock analysis.");
      if (!assigned.classTeacherClassIds.includes(klass.id)) {
        const subjects = teachingPairs(assigned).filter((a) => a.classId === klass.id).map((a) => a.subjectId);
        if (!subjects.length) throw new ForbiddenException("You don't teach this class.");
        allowedSubjects = new Set(subjects);
      }
    }

    const templates = await db.assessmentTemplate.findMany({
      where: { schoolId, category: "MOCK", academicYearId: year.id, OR: [{ classes: { some: { classId: klass.id } } }, { classes: { none: {} } }] },
      orderBy: [{ sequence: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      select: { id: true, name: true, sequence: true, gradingSystem: { select: { name: true, method: true } } },
    });
    const enrolments = await db.enrollment.findMany({
      where: { classId: klass.id, academicYearId: year.id, status: { in: ["ACTIVE", "COMPLETED"] }, student: { schoolId, deletedAt: null } },
      select: { student: { select: { id: true, admissionNumber: true, profile: { select: { firstName: true, lastName: true } } } } },
    });
    const students = [...new Map(enrolments.map((e) => [e.student.id, {
      id: e.student.id,
      admissionNumber: e.student.admissionNumber ?? "",
      name: `${e.student.profile.firstName} ${e.student.profile.lastName}`.trim(),
    }])).values()].sort((a, b) => a.name.localeCompare(b.name));

    const rows = templates.length && students.length
      ? await db.assessmentScore.findMany({
        where: {
          templateId: { in: templates.map((t) => t.id) },
          studentId: { in: students.map((s) => s.id) },
          status: input.includeDrafts ? undefined : { in: [...REPORTABLE_SCORE_STATUSES] },
          ...(allowedSubjects ? { subjectId: { in: [...allowedSubjects] } } : {}),
        },
        select: { studentId: true, templateId: true, subjectId: true, percentage: true, grade: true, gradePoint: true, subject: { select: { name: true } } },
      })
      : [];
    const scores: MockScoreRow[] = rows.map((r) => ({
      studentId: r.studentId, templateId: r.templateId, subjectId: r.subjectId, subjectName: r.subject.name,
      percentage: Number(r.percentage), grade: r.grade, gradePoint: r.gradePoint == null ? null : Number(r.gradePoint),
    }));

    const analytics = buildMockAnalytics(
      templates.map((t) => ({ id: t.id, name: t.name, sequence: t.sequence, yearName: year.name })),
      students,
      scores,
    );
    return {
      year, class: klass, includeDrafts: input.includeDrafts,
      subjectsLimited: allowedSubjects != null,
      gradingScales: [...new Set(templates.map((t) => t.gradingSystem.name))],
      ...analytics,
    };
  }
}
