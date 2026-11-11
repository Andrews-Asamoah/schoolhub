import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";
import { TeacherScopeService } from "../../common/scope/teacher-scope.service.js";
import { ReportVersionService } from "./report-version.service.js";

export const ARCHIVE_DEFAULT_PAGE_SIZE = 25;
export const ARCHIVE_MAX_PAGE_SIZE = 50;

export interface ArchiveQuery {
  page: number;
  pageSize: number;
  academicYearId?: string;
  termId?: string;
  /** The class the pupil was in when the report was issued. */
  classId?: string;
  /** Name or admission number; every word must match one of them. */
  q?: string;
}

/**
 * The published report cards a person may see. Owners, administrators and the headteacher see every
 * pupil's; a teacher sees pupils who are currently enrolled in a class they teach, for every year the
 * pupil has a published report. Pass the teacher's class ids as `scopeClassIds`, or null for no limit.
 * The same filter is used for the list and for each PDF request, so the two can never disagree.
 */
export function archiveWhere(schoolId: string, query: Partial<ArchiveQuery>, scopeClassIds: string[] | null): Prisma.ReportCardWhereInput {
  const words = (query.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  const contains = (value: string) => ({ contains: value, mode: "insensitive" as const });
  return {
    publishedAt: { not: null },
    set: {
      schoolId, status: "PUBLISHED",
      ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
      ...(query.termId ? { termId: query.termId } : {}),
    },
    student: {
      schoolId, deletedAt: null,
      ...(words.length ? { AND: words.map(word => ({ OR: [
        { admissionNumber: contains(word) },
        { profile: { firstName: contains(word) } },
        { profile: { lastName: contains(word) } },
      ] })) } : {}),
      ...(scopeClassIds ? { enrollments: { some: { classId: { in: scopeClassIds }, status: "ACTIVE" as const } } } : {}),
    },
    ...(query.classId ? { data: { path: ["student", "class", "id"], equals: query.classId } } : {}),
  };
}

type StoredReport = { student?: { class?: { id?: string; name?: string } | null } | null };

@Injectable()
export class ReportArchiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teacherScope: TeacherScopeService,
    private readonly versions: ReportVersionService,
  ) {}

  /** null means no limit (owner, administrator, headteacher); a list limits a teacher to those classes. */
  private async scopeFor(schoolId: string, userId: string, role: string): Promise<string[] | null> {
    if (role !== "teacher") return null;
    return this.teacherScope.getTaughtClassIds(schoolId, userId);
  }

  /** Choices for the archive filters: years and terms that have published reports, and the school's classes. */
  async filters(schoolId: string) {
    const db = this.prisma.client;
    const [sets, classes] = await Promise.all([
      db.reportCardSet.findMany({
        where: { schoolId, status: "PUBLISHED" },
        select: { academicYear: { select: { id: true, name: true, startDate: true } }, term: { select: { id: true, name: true, termNumber: true } } },
      }),
      db.class.findMany({
        where: { schoolId, deletedAt: null },
        orderBy: [{ name: "asc" }],
        select: { id: true, name: true, academicYear: { select: { name: true } } },
      }),
    ]);
    const years = new Map<string, { id: string; name: string; startDate: Date; terms: Map<string, { id: string; name: string; termNumber: number }> }>();
    for (const set of sets) {
      const year = years.get(set.academicYear.id) ?? { ...set.academicYear, terms: new Map() };
      year.terms.set(set.term.id, set.term);
      years.set(year.id, year);
    }
    return {
      years: [...years.values()]
        .sort((a, b) => b.startDate.getTime() - a.startDate.getTime())
        .map(year => ({ id: year.id, name: year.name, terms: [...year.terms.values()].sort((a, b) => a.termNumber - b.termNumber).map(({ id, name }) => ({ id, name })) })),
      classes: classes.map(c => ({ id: c.id, name: c.academicYear?.name ? `${c.name} (${c.academicYear.name})` : c.name })),
    };
  }

  async list(schoolId: string, userId: string, role: string, query: ArchiveQuery) {
    const pageSize = Math.min(Math.max(1, query.pageSize), ARCHIVE_MAX_PAGE_SIZE);
    const page = Math.max(1, query.page);
    const scope = await this.scopeFor(schoolId, userId, role);
    if (scope && scope.length === 0) return { items: [], total: 0, page, pageSize };
    const db = this.prisma.client;
    const where = archiveWhere(schoolId, query, scope);
    const [total, rows] = await Promise.all([
      db.reportCard.count({ where }),
      db.reportCard.findMany({
        where, orderBy: [{ publishedAt: "desc" }, { id: "asc" }], skip: (page - 1) * pageSize, take: pageSize,
        select: { id: true, setId: true, studentId: true, publishedAt: true, data: true,
          student: { select: { admissionNumber: true, profile: { select: { firstName: true, lastName: true } } } },
          set: { select: { name: true, academicYear: { select: { name: true } }, term: { select: { name: true } } } } },
      }),
    ]);
    // A report issued before versioned PDFs has no signed PDF to open; the page shows that state.
    const versions = rows.length
      ? await db.reportCardVersion.findMany({
          where: { schoolId, stage: "PUBLISHED", publishedAt: { not: null },
            setId: { in: [...new Set(rows.map(r => r.setId))] }, studentId: { in: [...new Set(rows.map(r => r.studentId))] } },
          select: { setId: true, studentId: true, version: true },
          orderBy: { version: "desc" },
        })
      : [];
    const versionOf = new Map<string, number>();
    for (const v of versions) { const key = v.setId + ":" + v.studentId; if (!versionOf.has(key)) versionOf.set(key, v.version); }
    return {
      total, page, pageSize,
      items: rows.map(row => {
        const classRow = (row.data as StoredReport | null)?.student?.class;
        const version = versionOf.get(row.setId + ":" + row.studentId) ?? null;
        return {
          id: row.id,
          pupilName: `${row.student.profile.firstName} ${row.student.profile.lastName}`.trim(),
          admissionNumber: row.student.admissionNumber,
          className: classRow?.name ?? null,
          setName: row.set.name,
          academicYear: row.set.academicYear.name,
          term: row.set.term.name,
          publishedAt: row.publishedAt,
          version,
          hasPdf: version !== null,
        };
      }),
    };
  }

  /**
   * A staff member opens a published report's PDF. Access is decided here on every request, never
   * from an earlier list: the report must still be in the person's scope. The download is recorded
   * in the audit trail once the PDF exists, because these are children's records.
   */
  async pdf(schoolId: string, actor: { id: string }, role: string, reportId: string) {
    const scope = await this.scopeFor(schoolId, actor.id, role);
    if (scope && scope.length === 0) throw new NotFoundException("Published report not found.");
    const db = this.prisma.client;
    const report = await db.reportCard.findFirst({
      where: { id: reportId, ...archiveWhere(schoolId, {}, scope) },
      select: { id: true, setId: true, studentId: true },
    });
    if (!report) throw new NotFoundException("Published report not found.");
    const file = await this.versions.publishedPdf(schoolId, actor.id, reportId, "staff");
    await db.auditLog.create({ data: { schoolId, userId: actor.id, action: "FILE_DOWNLOADED",
      entityType: "REPORT_CARD", entityId: report.id,
      newValues: { audience: "staff", role, setId: report.setId, studentId: report.studentId, filename: file.filename } } });
    return file;
  }
}
