import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import type { School } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";
import { sniffImage } from "./image-validation.js";
import { R2Service } from "./r2.service.js";

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
  ) {}

  private readImage(file: Express.Multer.File | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("No image file was provided.");
    }
    const image = sniffImage(file.buffer);
    if (!image) {
      throw new BadRequestException("Only JPEG, PNG and WebP images are allowed.");
    }
    return { buffer: file.buffer, ...image };
  }

  /** Only ever delete objects inside this school's own prefix. */
  private async removeOwned(school: School, url: string | null | undefined) {
    const key = this.r2.keyFromUrl(url);
    if (key?.startsWith(this.r2.keys.schoolPrefix(school.id))) {
      await this.r2.delete(key);
    }
  }

  async setSchoolLogo(school: School, file: Express.Multer.File | undefined) {
    const image = this.readImage(file);
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
    const image = this.readImage(file);
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


  async setPersonSignature(
    school: School,
    kind: string,
    personId: string,
    file: Express.Multer.File | undefined,
  ) {
    if (kind !== "teacher" && kind !== "staff") {
      throw new BadRequestException("Signature target must be a teacher or staff member.");
    }
    const image = this.readImage(file);
    const person = kind === "teacher"
      ? await this.prisma.client.teacher.findFirst({ where: { id: personId, schoolId: school.id, deletedAt: null }, select: { profileId: true } })
      : await this.prisma.client.staff.findFirst({ where: { id: personId, schoolId: school.id, deletedAt: null }, select: { profileId: true } });
    if (!person?.profileId) {
      throw new BadRequestException("This person needs a linked user profile before a signature can be stored.");
    }
    const profile = await this.prisma.client.userProfile.findUnique({
      where: { id: person.profileId },
      select: { id: true, signatureUrl: true },
    });
    if (!profile) throw new BadRequestException("The person's user profile was not found.");
    const url = await this.r2.upload(
      this.r2.keys.signature(school.id, kind, personId, image.ext),
      image.buffer,
      image.mime,
    );
    await this.prisma.client.userProfile.update({
      where: { id: profile.id },
      data: { signatureUrl: url },
    });
    await this.removeOwned(school, profile.signatureUrl);
    return { signatureUrl: url };
  }

  async removePersonSignature(school: School, kind: string, personId: string) {
    if (kind !== "teacher" && kind !== "staff") {
      throw new BadRequestException("Signature target must be a teacher or staff member.");
    }
    const person = kind === "teacher"
      ? await this.prisma.client.teacher.findFirst({ where: { id: personId, schoolId: school.id, deletedAt: null }, select: { profileId: true } })
      : await this.prisma.client.staff.findFirst({ where: { id: personId, schoolId: school.id, deletedAt: null }, select: { profileId: true } });
    if (!person?.profileId) throw new BadRequestException("This person has no linked user profile.");
    const profile = await this.prisma.client.userProfile.findUnique({
      where: { id: person.profileId },
      select: { id: true, signatureUrl: true },
    });
    if (!profile) throw new BadRequestException("The person's user profile was not found.");
    await this.prisma.client.userProfile.update({ where: { id: profile.id }, data: { signatureUrl: null } });
    await this.removeOwned(school, profile.signatureUrl);
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
