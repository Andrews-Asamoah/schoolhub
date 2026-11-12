import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { PrivateStorageService } from "../storage/private-storage.service.js";
import { R2Service } from "../storage/r2.service.js";
import { MAX_REPORT_IMAGE_INPUT_BYTES, reportImageDataUrl } from "./report-images.js";

export interface ReportLetterhead {
  name: string;
  code: string;
  motto: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  /** The logo as a small data URL, when the school has one that can be read. */
  logo: string | null;
}

/**
 * The pictures and letterhead a report needs, read at the moment it is shown or printed:
 * approver signatures, the pupil's photo and the school's details.
 *
 * None of this is part of the sealed academic snapshot. It is presentation, and if a picture
 * cannot be read the report still opens, but the reason is logged so it is never a silent blank.
 */
@Injectable()
export class ReportAssetsService {
  private readonly logger = new Logger(ReportAssetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly privateStorage: PrivateStorageService,
    private readonly r2: R2Service,
  ) {}

  /** The person's uploaded signature as a PDF-ready data URL, or null when they have none. */
  async signatureFor(schoolId: string, userId: string): Promise<string | null> {
    try {
      const profile = await this.prisma.client.userProfile.findUnique({ where: { userId }, select: { signatureStorageKey: true } });
      if (!profile?.signatureStorageKey) return null;
      const bytes = await this.privateStorage.read(schoolId, profile.signatureStorageKey, MAX_REPORT_IMAGE_INPUT_BYTES);
      const image = await reportImageDataUrl(bytes, { maxWidth: 260, maxHeight: 90, format: "png" });
      if (!image) this.logger.warn(`Signature for user ${userId} is not a readable image.`);
      return image;
    } catch (error) {
      this.logger.warn(`Could not read the signature for user ${userId}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Approval signatures for a report. A signature copied when the approver signed off is kept as it
   * is, so a report never changes if they later replace it. Where none was captured (they had not
   * uploaded one yet, or it could not be read then), their current signature is shown instead.
   */
  async approvalSignatures(
    schoolId: string,
    version: { teacherActorId: string | null; teacherSignature: string | null; headActorId: string | null; headSignature: string | null },
    cache: Map<string, Promise<string | null>> = new Map(),
  ): Promise<{ teacher: string | null; head: string | null }> {
    const lookup = (userId: string | null) => {
      if (!userId) return Promise.resolve(null);
      if (!cache.has(userId)) cache.set(userId, this.signatureFor(schoolId, userId));
      return cache.get(userId)!;
    };
    const [teacher, head] = await Promise.all([
      version.teacherSignature ? Promise.resolve(version.teacherSignature) : lookup(version.teacherActorId),
      version.headSignature ? Promise.resolve(version.headSignature) : lookup(version.headActorId),
    ]);
    return { teacher, head };
  }

  /**
   * Who signs reports for a class: its current class teacher and the school's headteacher.
   * Used to show their uploaded signatures on reports that are generated but not yet approved,
   * so a school can see and print the report as it will look. If the school has more than one
   * headteacher account, the earliest created one is used.
   */
  async designatedSignatories(schoolId: string, classId: string): Promise<{
    teacher: { userId: string; name: string } | null;
    head: { userId: string; name: string } | null;
  }> {
    const db = this.prisma.client;
    const today = new Date();
    const [assignment, school] = await Promise.all([
      db.classTeacherAssignment.findFirst({
        where: { schoolId, classId, effectiveFrom: { lte: today }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: today } }] },
        orderBy: { effectiveFrom: "desc" },
        select: { teacher: { select: { profile: { select: { userId: true, user: { select: { name: true } } } } } } },
      }),
      db.school.findUnique({ where: { id: schoolId }, select: { organizationId: true } }),
    ]);
    const head = school
      ? await db.member.findFirst({
          where: { organizationId: school.organizationId, banned: false, OR: [{ role: "headteacher" }, { roles: { has: "headteacher" } }] },
          orderBy: { createdAt: "asc" },
          select: { userId: true, user: { select: { name: true } } },
        })
      : null;
    const teacherProfile = assignment?.teacher.profile;
    return {
      teacher: teacherProfile ? { userId: teacherProfile.userId, name: teacherProfile.user.name } : null,
      head: head ? { userId: head.userId, name: head.user.name } : null,
    };
  }

  /** The pupil's photo for the PDF, or null so the report draws a placeholder. */
  async studentPhoto(schoolId: string, studentId: string): Promise<string | null> {
    try {
      const student = await this.prisma.client.student.findFirst({
        where: { id: studentId, schoolId },
        select: { profile: { select: { user: { select: { image: true } } } } },
      });
      return await this.publicImage(schoolId, student?.profile?.user?.image, { maxWidth: 90, maxHeight: 110, format: "jpeg" });
    } catch (error) {
      this.logger.warn(`Could not read the photo for student ${studentId}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /** The school's name, contact details and logo, as they are today. */
  async letterhead(schoolId: string): Promise<ReportLetterhead | null> {
    try {
      const school = await this.prisma.client.school.findUnique({
        where: { id: schoolId },
        select: { name: true, code: true, motto: true, address: true, phone: true, email: true, website: true, logo: true },
      });
      if (!school) return null;
      const logo = await this.publicImage(schoolId, school.logo, { maxWidth: 48, maxHeight: 48, format: "png" });
      return { ...school, logo };
    } catch (error) {
      this.logger.warn(`Could not read the letterhead for school ${schoolId}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /** Reads an image the school itself uploaded to the public bucket. Never follows a URL outside the school's own folder. */
  private async publicImage(schoolId: string, url: string | null | undefined, options: Parameters<typeof reportImageDataUrl>[1]) {
    const key = this.r2.keyFromUrl(url);
    if (!key || !key.startsWith(this.r2.keys.schoolPrefix(schoolId))) return null;
    return reportImageDataUrl(await this.r2.read(key, MAX_REPORT_IMAGE_INPUT_BYTES), options);
  }
}
