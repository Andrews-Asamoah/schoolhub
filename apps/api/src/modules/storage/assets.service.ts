import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
  ConflictException,
} from "@nestjs/common";
import type { School } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";
import { sniffImage } from "./image-validation.js";
import { PrivateStorageService } from "./private-storage.service.js";
import { UploadValidationService } from "./upload-validation.service.js";
import { StorageCleanupService } from "./storage-cleanup.service.js";
import { writeAudit, type AuditActor } from "../../common/audit/audit.js";
import { R2Service } from "./r2.service.js";

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
    private readonly storage: PrivateStorageService,
    private readonly validation: UploadValidationService,
    private readonly cleanup: StorageCleanupService,
  ) {}

  private async readImage(file: Express.Multer.File | undefined, purpose: "document" | "profile" | "logo" = "document") {
    if (!file?.buffer?.length) {
      throw new BadRequestException("No image file was provided.");
    }
    const image = sniffImage(file.buffer);
    if (!image) {
      throw new BadRequestException("Only JPEG, PNG and WebP images are allowed.");
    }
    return this.validation.image(file.buffer, purpose);
  }

  /** Only ever delete objects inside this school's own prefix. */
  private async removeOwned(school: School, url: string | null | undefined) {
    const key = this.r2.keyFromUrl(url);
    if (key?.startsWith(this.r2.keys.schoolPrefix(school.id))) {
      await this.r2.delete(key);
    }
  }

  async setSchoolLogo(school: School, file: Express.Multer.File | undefined) {
    const image = await this.readImage(file, "logo");
    const url = await this.r2
      .upload(this.r2.keys.logo(school.id, image.ext), image.buffer, image.mime)
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "ServiceUnavailableException") {
          throw error;
        }
        throw new InternalServerErrorException("Could not store the logo.");
      });

    await this.prisma.client.$transaction([
      this.prisma.client.school.update({ where: { id: school.id }, data: { logo: url } }),
      this.prisma.client.organization.update({
        where: { id: school.organizationId },
        data: { logo: url },
      }),
    ]);
    await this.removeOwned(school, school.logo);
    return { logo: url };
  }

  async removeSchoolLogo(school: School) {
    await this.prisma.client.$transaction([
      this.prisma.client.school.update({ where: { id: school.id }, data: { logo: null } }),
      this.prisma.client.organization.update({
        where: { id: school.organizationId },
        data: { logo: null },
      }),
    ]);
    await this.removeOwned(school, school.logo);
    return { logo: null };
  }

  async setAvatar(school: School, userId: string, file: Express.Multer.File | undefined) {
    const image = await this.readImage(file, "profile");
    const previous = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { image: true },
    });
    const url = await this.r2.upload(
      this.r2.keys.avatar(school.id, userId, image.ext),
      image.buffer,
      image.mime,
    );
    await this.prisma.client.user.update({ where: { id: userId }, data: { image: url } });
    await this.removeOwned(school, previous?.image);
    return { image: url };
  }


  async setPersonAvatar(school: School, kind: string, personId: string, file: Express.Multer.File | undefined, actor: AuditActor) {
    if (kind !== "teacher" && kind !== "student") throw new BadRequestException("Invalid photo target.");
    const where = { id: personId, schoolId: school.id, deletedAt: null };
    const person = kind === "teacher"
      ? await this.prisma.client.teacher.findFirst({ where, select: { profileId: true } })
      : await this.prisma.client.student.findFirst({ where, select: { profileId: true } });
    if (!person?.profileId) throw new NotFoundException("Person not found.");
    const profile = await this.prisma.client.userProfile.findUniqueOrThrow({ where: { id: person.profileId }, select: { userId: true } });
    const result = await this.setAvatar(school, profile.userId, file);
    await writeAudit(this.prisma.client, actor, { action: "UPDATE", entityType: "person.photo", entityId: personId, schoolId: school.id });
    return result;
  }

  private async signatureProfile(school: School, kind: string, personId: string) {
    if (kind !== "teacher" && kind !== "staff") throw new BadRequestException("Signature target must be a teacher or staff member.");
    const person = kind === "teacher"
      ? await this.prisma.client.teacher.findFirst({ where: { id: personId, schoolId: school.id, deletedAt: null }, select: { profileId: true } })
      : await this.prisma.client.staff.findFirst({ where: { id: personId, schoolId: school.id, deletedAt: null }, select: { profileId: true } });
    if (!person?.profileId) throw new NotFoundException("Signature profile not found.");
    const profile = await this.prisma.client.userProfile.findUnique({ where: { id: person.profileId },
      select: { id: true, signatureUrl: true, signatureStorageKey: true } });
    if (!profile) throw new NotFoundException("Signature profile not found.");
    return profile;
  }

  async setPersonSignature(school: School, kind: string, personId: string, file: Express.Multer.File | undefined, actor: AuditActor) {
    const profile = await this.signatureProfile(school, kind, personId);
    const image = await this.readImage(file);
    const key = this.r2.keys.signature(school.id, kind, personId, image.ext);
    const reservation = await this.cleanup.reserve(school.id, key);
    await this.storage.upload(school.id, key, image.buffer, image.mime);
    const url = `/api/schools/current/signatures/${kind}/${personId}`;
    try {
      await this.prisma.client.$transaction(async tx => {
        const updated = await tx.userProfile.updateMany({ where: { id: profile.id, signatureStorageKey: profile.signatureStorageKey },
          data: { signatureUrl: url, signatureStorageKey: key } });
        if (!updated.count) throw new ConflictException("The signature changed. Refresh and try again.");
        if (profile.signatureStorageKey?.startsWith(this.r2.keys.schoolPrefix(school.id))) await this.cleanup.enqueue(school.id, profile.signatureStorageKey, tx);
        await this.cleanup.keep(reservation, tx);
        await writeAudit(tx, actor, { action: "UPDATE", entityType: "signature.upload", entityId: personId, schoolId: school.id });
      });
    } catch (error) {
      await this.cleanup.enqueue(school.id, key);
      throw error;
    }
    return { signatureUrl: url };
  }

  async readPersonSignature(school: School, kind: string, personId: string, actor: AuditActor) {
    const profile = await this.signatureProfile(school, kind, personId);
    if (!profile.signatureUrl) throw new NotFoundException("Signature not found.");
    if (!profile.signatureStorageKey) throw new ServiceUnavailableException("This signature is awaiting private-storage migration.");
    const body = await this.storage.read(school.id, profile.signatureStorageKey, 10 * 1024 * 1024);
    await writeAudit(this.prisma.client, actor, { action: "FILE_DOWNLOADED", entityType: "signature.download", entityId: personId, schoolId: school.id });
    return body;
  }

  async removePersonSignature(school: School, kind: string, personId: string, actor: AuditActor) {
    const profile = await this.signatureProfile(school, kind, personId);
    await this.prisma.client.$transaction(async tx => {
      const updated = await tx.userProfile.updateMany({ where: { id: profile.id, signatureStorageKey: profile.signatureStorageKey },
        data: { signatureUrl: null, signatureStorageKey: null } });
      if (!updated.count) throw new ConflictException("The signature changed. Refresh and try again.");
      if (profile.signatureStorageKey?.startsWith(this.r2.keys.schoolPrefix(school.id))) await this.cleanup.enqueue(school.id, profile.signatureStorageKey, tx);
      await writeAudit(tx, actor, { action: "DELETE", entityType: "signature.delete", entityId: personId, schoolId: school.id });
    });
    return { signatureUrl: null };
  }

  async removeAvatar(school: School, userId: string) {
    const previous = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { image: true },
    });
    await this.prisma.client.user.update({ where: { id: userId }, data: { image: null } });
    await this.removeOwned(school, previous?.image);
    return { image: null };
  }
}
