import { Injectable, NotFoundException } from "@nestjs/common";
import { NAME_LOCKED_ROLES, type UpdateMyProfileInput } from "@schoolhub/shared";
import { PrismaService } from "../../prisma/prisma.service.js";

const PROFILE_FIELDS = {
  firstName: true,
  lastName: true,
  otherNames: true,
  phone: true,
  alternatePhone: true,
  residentialAddress: true,
  city: true,
  region: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  emergencyRelationship: true,
} as const;

function splitName(full: string) {
  const [first = "", ...rest] = full.trim().split(/\s+/);
  return { first, last: rest.join(" ") || first };
}

/** A signed-in user's own basic details. Never touches email, role or anyone else's record. */
@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  isNameLocked(role: string | undefined) {
    return (NAME_LOCKED_ROLES as readonly string[]).includes(role ?? "");
  }

  async getProfile(userId: string, role: string | undefined) {
    const db = this.prisma.client;
    const [user, profile, student] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: { name: true, email: true, image: true } }),
      db.userProfile.findUnique({ where: { userId }, select: PROFILE_FIELDS }),
      // Students sign in with a username; their email is a generated internal address.
      role === "student"
        ? db.student.findFirst({ where: { deletedAt: null, profile: { userId } }, select: { username: true } })
        : Promise.resolve(null),
    ]);
    if (!user) throw new NotFoundException("Account not found");
    const fallback = splitName(user.name);
    return {
      user,
      username: student?.username ?? null,
      profile: profile ?? {
        firstName: fallback.first,
        lastName: fallback.last,
        otherNames: null,
        phone: null,
        alternatePhone: null,
        residentialAddress: null,
        city: null,
        region: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        emergencyRelationship: null,
      },
      canEditName: !this.isNameLocked(role),
    };
  }

  async updateProfile(userId: string, role: string | undefined, input: UpdateMyProfileInput) {
    const db = this.prisma.client;
    const [user, existing] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: { name: true } }),
      db.userProfile.findUnique({ where: { userId }, select: { id: true, firstName: true, lastName: true } }),
    ]);
    if (!user) throw new NotFoundException("Account not found");

    const lockName = this.isNameLocked(role);
    const fallback = splitName(user.name);
    const firstName = lockName ? existing?.firstName ?? fallback.first : input.firstName ?? existing?.firstName ?? fallback.first;
    const lastName = lockName ? existing?.lastName ?? fallback.last : input.lastName ?? existing?.lastName ?? fallback.last;

    // `undefined` leaves a field alone; `null` clears it.
    const details = {
      phone: input.phone,
      alternatePhone: input.alternatePhone,
      residentialAddress: input.residentialAddress,
      city: input.city,
      region: input.region,
      emergencyContactName: input.emergencyContactName,
      emergencyContactPhone: input.emergencyContactPhone,
      emergencyRelationship: input.emergencyRelationship,
    };
    const names = lockName ? {} : { firstName, lastName, otherNames: input.otherNames };

    await db.$transaction(async (tx) => {
      const profile = await tx.userProfile.upsert({
        where: { userId },
        create: { userId, firstName, lastName, ...names, ...details },
        update: { ...names, ...details },
        select: { id: true },
      });
      if (!lockName) {
        await tx.user.update({ where: { id: userId }, data: { name: `${firstName} ${lastName}`.trim() } });
        // Teacher records keep their own copy of the name; keep it in step.
        await tx.teacher.updateMany({ where: { profileId: profile.id }, data: { firstName, lastName } });
      }
    });

    return this.getProfile(userId, role);
  }
}
