import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";
import { R2Service } from "../storage/r2.service.js";
import { StorageCleanupService } from "../storage/storage-cleanup.service.js";
import { writeAudit, type AuditActor } from "../../common/audit/audit.js";
import type { StudentDeletionQuery } from "@schoolhub/shared";
import {
  buildImpact,
  describeBlockers,
  isDedicatedLogin,
  planGuardians,
  type DeletionImpact,
  type GuardianCandidate,
} from "./student-deletion-impact.js";

type Tx = Prisma.TransactionClient;
export interface Requester {
  id: string;
  name: string;
}

interface Assessment {
  studentName: string;
  admissionNumber: string | null;
  className: string | null;
  status: string;
  /** The student's own sign-in account, when it exists only for them. */
  studentUserId: string | null;
  studentUserImage: string | null;
  impact: DeletionImpact;
  guardians: { remove: GuardianCandidate[]; keep: GuardianCandidate[] };
  /** Guardian accounts that will be deleted with the record. */
  guardianLogins: { userId: string; image: string | null }[];
}

const REQUEST_DESCRIPTIONS = {
  alreadyHandled: "This request has already been handled.",
};

@Injectable()
export class StudentDeletionService {
  private readonly logger = new Logger(StudentDeletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
    private readonly cleanup: StorageCleanupService,
  ) {}

  // ------------------------------------------------------------ assessment

  /** Reads everything a deletion would touch. Returns null when the student does not exist. */
  private async assess(tx: Tx, schoolId: string, studentId: string): Promise<Assessment | null> {
    const student = await tx.student.findFirst({
      where: { id: studentId, schoolId },
      select: {
        admissionNumber: true,
        status: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            userId: true,
            user: { select: { image: true, role: true } },
          },
        },
        class: { select: { name: true } },
        _count: {
          select: {
            bills: true,
            payments: true,
            externalExamCandidates: true,
            enrollments: true,
            attendances: true,
            assessmentScores: true,
            remarks: true,
            reportCards: true,
            reportCardVersions: true,
            assignmentSubmissions: true,
            clubMembers: true,
            promotionRecords: true,
            documents: true,
            transcripts: true,
            attendanceExcuseRequests: true,
            attendanceExclusions: true,
            scholarships: true,
            guardians: true,
          },
        },
      },
    });
    if (!student) return null;

    const [billAdjustments, creditEntries] = await Promise.all([
      tx.financeBillAdjustment.count({ where: { schoolId, studentId } }),
      tx.financeStudentCreditEntry.count({ where: { schoolId, studentId } }),
    ]);
    const { guardians: guardianLinks, ...counts } = student._count;
    const impact = buildImpact({ ...counts, guardianLinks, billAdjustments, creditEntries });

    // The student's own login goes with them, unless it is shared with another role.
    const studentUserId = student.profile.userId;
    const studentMembers = await tx.member.findMany({ where: { userId: studentUserId }, select: { role: true } });
    const ownLogin = isDedicatedLogin(
      student.profile.user,
      studentMembers.map((member) => member.role),
      "student",
    );

    const guardianRows = await tx.guardian.findMany({
      where: { schoolId, students: { some: { studentId } } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        _count: { select: { students: true } },
        profile: {
          select: {
            userId: true,
            user: { select: { image: true, role: true } },
            student: { select: { id: true } },
            teacher: { select: { id: true } },
            staff: { select: { id: true } },
          },
        },
      },
    });
    const guardianImages = new Map<string, string | null>();
    const candidates: GuardianCandidate[] = [];
    for (const row of guardianRows) {
      let userId: string | null = null;
      let hasOtherRole = false;
      if (row.profile) {
        const members = await tx.member.findMany({ where: { userId: row.profile.userId }, select: { role: true } });
        const dedicated =
          !row.profile.student &&
          !row.profile.teacher &&
          !row.profile.staff &&
          isDedicatedLogin(row.profile.user, members.map((member) => member.role), "guardian");
        hasOtherRole = !dedicated;
        if (dedicated) {
          userId = row.profile.userId;
          guardianImages.set(row.profile.userId, row.profile.user?.image ?? null);
        }
      }
      candidates.push({
        id: row.id,
        name: `${row.firstName} ${row.lastName}`.trim(),
        linkedStudents: row._count.students,
        userId,
        hasOtherRole,
      });
    }
    const guardians = planGuardians(candidates);

    return {
      studentName: `${student.profile.firstName} ${student.profile.lastName}`.trim(),
      admissionNumber: student.admissionNumber,
      className: student.class?.name ?? null,
      status: student.status,
      studentUserId: ownLogin ? studentUserId : null,
      studentUserImage: ownLogin ? (student.profile.user?.image ?? null) : null,
      impact,
      guardians,
      guardianLogins: guardians.remove
        .filter((guardian) => guardian.userId)
        .map((guardian) => ({ userId: guardian.userId!, image: guardianImages.get(guardian.userId!) ?? null })),
    };
  }

  private toImpactView(assessment: Assessment) {
    return {
      student: {
        name: assessment.studentName,
        admissionNumber: assessment.admissionNumber,
        className: assessment.className,
        status: assessment.status,
      },
      blockers: assessment.impact.blockers,
      willDelete: assessment.impact.willDelete,
      canDelete: assessment.impact.canDelete,
      guardiansRemoved: assessment.guardians.remove.map((guardian) => guardian.name),
      guardiansKept: assessment.guardians.keep.map((guardian) => guardian.name),
      studentLoginRemoved: assessment.studentUserId !== null,
    };
  }

  /** What deleting this student would remove, for the school's confirmation screen. */
  async previewForSchool(schoolId: string, studentId: string) {
    const assessment = await this.prisma.client.$transaction((tx) => this.assess(tx, schoolId, studentId));
    if (!assessment) throw new NotFoundException("Student not found.");
    return this.toImpactView(assessment);
  }

  // ------------------------------------------------------ school-side flow

  async requestDeletion(schoolId: string, requester: Requester, studentId: string, reason: string, actor: AuditActor) {
    return this.prisma.client.$transaction(async (tx) => {
      await this.lock(tx, studentId);
      const assessment = await this.assess(tx, schoolId, studentId);
      if (!assessment) throw new NotFoundException("Student not found.");
      if (!assessment.impact.canDelete) {
        throw new BadRequestException(
          `This student has ${describeBlockers(assessment.impact.blockers)}, so the record cannot be deleted. Withdraw the student instead.`,
        );
      }
      const pending = await tx.studentDeletionRequest.findFirst({
        where: { studentId, status: "PENDING" },
        select: { id: true },
      });
      if (pending) {
        throw new ConflictException("A deletion request for this student is already waiting for the platform administrator.");
      }
      const request = await tx.studentDeletionRequest.create({
        data: {
          schoolId,
          studentId,
          studentName: assessment.studentName,
          admissionNumber: assessment.admissionNumber,
          className: assessment.className,
          reason,
          requestedById: requester.id,
          requestedByName: requester.name,
        },
      });
      await writeAudit(tx, actor, {
        action: "CREATE",
        entityType: "student.deletion.request",
        entityId: request.id,
        schoolId,
        newValues: { studentId, studentName: assessment.studentName, reason },
      });
      return request;
    });
  }

  listForSchool(schoolId: string, studentId?: string) {
    return this.prisma.client.studentDeletionRequest.findMany({
      where: { schoolId, ...(studentId ? { studentId } : {}) },
      orderBy: { createdAt: "desc" },
      take: studentId ? 10 : 50,
    });
  }

  async cancel(schoolId: string, requestId: string, actor: AuditActor) {
    const result = await this.prisma.client.studentDeletionRequest.updateMany({
      where: { id: requestId, schoolId, status: "PENDING" },
      data: { status: "CANCELLED", reviewedAt: new Date() },
    });
    if (result.count === 0) throw new ConflictException("Only a request that is still waiting can be cancelled.");
    await writeAudit(this.prisma.client, actor, {
      action: "UPDATE",
      entityType: "student.deletion.cancel",
      entityId: requestId,
      schoolId,
    });
    return { success: true };
  }

  // ---------------------------------------------------- super-admin side

  async listForPlatform(query: StudentDeletionQuery) {
    const where = query.status ? { status: query.status } : {};
    const [data, total, pending] = await Promise.all([
      this.prisma.client.studentDeletionRequest.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { school: { select: { id: true, name: true, code: true, subdomain: true } } },
      }),
      this.prisma.client.studentDeletionRequest.count({ where }),
      this.prisma.client.studentDeletionRequest.count({ where: { status: "PENDING" } }),
    ]);
    return { data, pending, meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) } };
  }

  /** Live impact for a pending request, so the decision is made on current facts. */
  async impactForRequest(requestId: string) {
    const request = await this.prisma.client.studentDeletionRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException("Request not found.");
    if (request.status !== "PENDING") return { alreadyHandled: true as const, studentRemoved: false };
    const assessment = await this.prisma.client.$transaction((tx) => this.assess(tx, request.schoolId, request.studentId));
    if (!assessment) return { alreadyHandled: false as const, studentRemoved: true as const };
    return { alreadyHandled: false as const, studentRemoved: false as const, ...this.toImpactView(assessment) };
  }

  async reject(requestId: string, reviewer: Requester, decisionNote: string, actor: AuditActor) {
    const result = await this.prisma.client.studentDeletionRequest.updateMany({
      where: { id: requestId, status: "PENDING" },
      data: {
        status: "REJECTED",
        decisionNote,
        reviewedById: reviewer.id,
        reviewedByName: reviewer.name,
        reviewedAt: new Date(),
      },
    });
    if (result.count === 0) throw new ConflictException(REQUEST_DESCRIPTIONS.alreadyHandled);
    const request = await this.prisma.client.studentDeletionRequest.findUniqueOrThrow({ where: { id: requestId } });
    await writeAudit(this.prisma.client, actor, {
      action: "UPDATE",
      entityType: "super-admin.student.deletion.reject",
      entityId: requestId,
      schoolId: request.schoolId,
      newValues: { studentId: request.studentId, decisionNote },
    });
    return { success: true };
  }

  /**
   * Permanently removes the student, their login, anything that belongs only to
   * them, and any parent who has no other child at the school. All of it
   * happens in one transaction: if anything is still in use, nothing is deleted.
   */
  async approve(requestId: string, reviewer: Requester, actor: AuditActor) {
    const request = await this.prisma.client.studentDeletionRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundException("Request not found.");

    let photoKeys: string[] = [];
    let summary: Record<string, unknown>;
    try {
      summary = await this.prisma.client.$transaction(
        async (tx) => {
          await this.lock(tx, request.studentId);
          // Claim the request first, so two people clicking at once cannot both delete.
          const claimed = await tx.studentDeletionRequest.updateMany({
            where: { id: requestId, status: "PENDING" },
            data: { status: "APPROVED", reviewedById: reviewer.id, reviewedByName: reviewer.name, reviewedAt: new Date() },
          });
          if (claimed.count === 0) throw new ConflictException(REQUEST_DESCRIPTIONS.alreadyHandled);

          const { schoolId, studentId } = request;
          const assessment = await this.assess(tx, schoolId, studentId);
          if (!assessment) {
            const gone = { alreadyRemoved: true };
            await tx.studentDeletionRequest.update({ where: { id: requestId }, data: { result: gone } });
            return gone;
          }
          if (!assessment.impact.canDelete) {
            throw new ConflictException(
              `This student now has ${describeBlockers(assessment.impact.blockers)}, so it cannot be deleted. Reject the request and ask the school to withdraw the student.`,
            );
          }

          photoKeys = await this.collectFiles(tx, studentId, schoolId, [
            assessment.studentUserImage,
            ...assessment.guardianLogins.map((login) => login.image),
          ]);

          const userIds = [
            ...(assessment.studentUserId ? [assessment.studentUserId] : []),
            ...assessment.guardianLogins.map((login) => login.userId),
          ];
          // These rows point at the account without cascading, so they go first.
          if (userIds.length) {
            await tx.notificationDelivery.deleteMany({ where: { userId: { in: userIds } } });
            await tx.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
            await tx.passwordRecoveryRequest.deleteMany({ where: { userId: { in: userIds } } });
          }
          await tx.feeReminderLog.deleteMany({ where: { studentId } });

          // Deleting the student cascades to everything that belongs only to them.
          await tx.student.delete({ where: { id: studentId } });

          // Guardians left with no child: the account goes too (which removes the guardian row).
          const loginless = assessment.guardians.remove.filter((guardian) => !guardian.userId).map((guardian) => guardian.id);
          if (loginless.length) await tx.guardian.deleteMany({ where: { id: { in: loginless } } });
          if (userIds.length) await tx.user.deleteMany({ where: { id: { in: userIds } } });

          const result = {
            studentName: assessment.studentName,
            admissionNumber: assessment.admissionNumber,
            removed: assessment.impact.willDelete.map((line) => ({ label: line.label, count: line.count })),
            guardiansRemoved: assessment.guardians.remove.map((guardian) => guardian.name),
            guardiansKept: assessment.guardians.keep.map((guardian) => guardian.name),
            studentLoginRemoved: assessment.studentUserId !== null,
          };
          await tx.studentDeletionRequest.update({ where: { id: requestId }, data: { result } });
          await writeAudit(tx, actor, {
            action: "DELETE",
            entityType: "super-admin.student.hard-delete",
            entityId: studentId,
            schoolId,
            oldValues: { requestId, reason: request.reason, requestedBy: request.requestedByName },
            newValues: result,
          });
          return result;
        },
        { timeout: 30_000, maxWait: 10_000 },
      );
    } catch (error) {
      if ((error as { code?: string } | null)?.code === "P2003") {
        this.logger.warn(`Student deletion ${requestId} blocked by a reference: ${(error as Error).message}`);
        throw new ConflictException(
          "Something else still refers to this student or their account (for example a support ticket), so nothing was deleted.",
        );
      }
      throw error;
    }

    // The database is already clean. Profile photos are removed best effort;
    // private files were queued as durable jobs inside the transaction.
    await this.removePhotos(photoKeys);
    return { success: true, summary };
  }

  // -------------------------------------------------------------- helpers

  /** Serialises work on one student so concurrent clicks queue instead of racing. */
  private async lock(tx: Tx, studentId: string) {
    // $executeRaw: pg_advisory_xact_lock returns `void`, which $queryRaw cannot read.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('student-deletion'), hashtext(${studentId}))`;
  }

  /**
   * Queues private files (documents, absence attachments) for durable removal
   * inside the transaction, and returns the profile-photo keys to remove after it.
   */
  private async collectFiles(tx: Tx, studentId: string, schoolId: string, avatarUrls: (string | null)[]) {
    const [documents, absences] = await Promise.all([
      tx.document.findMany({ where: { studentId }, select: { storageKey: true } }),
      tx.attendanceExcuseRequest.findMany({ where: { studentId }, select: { attachmentKey: true } }),
    ]);
    const privateKeys = [
      ...documents.map((document) => document.storageKey),
      ...absences.map((absence) => absence.attachmentKey),
    ].filter((key): key is string => Boolean(key));
    for (const key of privateKeys) await this.cleanup.enqueue(schoolId, key, tx);

    const prefix = this.r2.keys.schoolPrefix(schoolId);
    return avatarUrls
      .map((url) => this.r2.keyFromUrl(url))
      .filter((key): key is string => Boolean(key) && key!.startsWith(prefix));
  }

  private async removePhotos(keys: string[]) {
    for (const key of keys) {
      try {
        await this.r2.delete(key);
      } catch (error) {
        this.logger.warn(`Could not remove photo ${key}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}
