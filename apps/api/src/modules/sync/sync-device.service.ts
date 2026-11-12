import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  RegisterSyncDeviceInput,
  SyncDeviceQuery,
} from '@schoolhub/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { writeAudit, type AuditActor } from '../../common/audit/audit.js';
import { desktopVersionError } from '../../common/desktop-policy.js';

const visible = {
  id: true,
  name: true,
  platform: true,
  clientVersion: true,
  createdAt: true,
  lastSeenAt: true,
  revokedAt: true,
  owner: { select: { id: true, name: true } },
} satisfies Prisma.SyncDeviceSelect;
export type DeviceAccess = {
  schoolId: string;
  actor: AuditActor;
  role: string;
  sessionId: string;
};
const managesSchool = (role: string) => role === 'owner' || role === 'admin';

/** Serializes device lifecycle changes only; never used as a sync cursor. */
async function lockSchool(tx: Prisma.TransactionClient, schoolId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`sync-device:${schoolId}`}, 0))`;
}

@Injectable()
export class SyncDeviceService {
  constructor(private readonly prisma: PrismaService) {}

  async register(
    access: DeviceAccess,
    input: RegisterSyncDeviceInput,
    clientVersion: string,
  ) {
    if (desktopVersionError(clientVersion))
      throw new ForbiddenException('A supported desktop version is required.');
    return this.prisma.client.$transaction(async (tx) => {
      // Same lock order as revoke: school, session, device. A revoke cannot race
      // a registration into attaching a fresh session to an already revoked row.
      await lockSchool(tx, access.schoolId);
      await tx.$queryRaw`SELECT id FROM sessions WHERE id = ${access.sessionId} FOR UPDATE`;
      const session = await tx.session.findUnique({
        where: { id: access.sessionId },
      });
      if (
        !session ||
        session.userId !== access.actor.id ||
        session.expiresAt <= new Date()
      ) {
        throw new UnauthorizedException(
          'Sign in again before registering this installation.',
        );
      }
      if (session.clientPlatform !== 'desktop' || session.impersonatedBy) {
        throw new ForbiddenException(
          'Only a signed-in desktop session can register an installation.',
        );
      }
      let device = await tx.syncDevice.findUnique({
        where: {
          schoolId_userId_installationId: {
            schoolId: access.schoolId,
            userId: access.actor.id,
            installationId: input.installationId,
          },
        },
      });
      if (device?.revokedAt)
        throw new ForbiddenException({
          error: 'SYNC_DEVICE_REVOKED',
          message:
            'This installation has been revoked. Contact your school administrator.',
        });
      if (session.desktopDeviceId && session.desktopDeviceId !== device?.id) {
        throw new ConflictException(
          'This session is already bound to another installation. Sign in again.',
        );
      }
      const newlyRegistered = !device;
      const metadata = {
        name: input.name,
        platform: input.platform,
        clientVersion,
        lastSeenAt: new Date(),
      };
      device = device
        ? await tx.syncDevice.update({
            where: { id: device.id },
            data: metadata,
          })
        : await tx.syncDevice.create({
            data: {
              ...metadata,
              schoolId: access.schoolId,
              userId: access.actor.id,
              installationId: input.installationId,
            },
          });
      await tx.session.update({
        where: { id: session.id },
        data: { desktopDeviceId: device.id },
      });
      if (newlyRegistered || session.desktopDeviceId !== device.id) {
        await writeAudit(tx, access.actor, {
          action: 'ACCESS_CHANGED',
          entityType: 'sync.device.register',
          entityId: device.id,
          schoolId: access.schoolId,
          newValues: {
            platform: device.platform,
            clientVersion,
            newlyRegistered,
          },
        });
      }
      return {
        id: device.id,
        name: device.name,
        platform: device.platform,
        clientVersion,
        revokedAt: null,
      };
    });
  }

  async list(access: DeviceAccess, query: SyncDeviceQuery) {
    if (query.scope === 'school' && !managesSchool(access.role))
      throw new ForbiddenException(
        'Only school owners and administrators can list school devices.',
      );
    const where = {
      schoolId: access.schoolId,
      ...(query.scope === 'mine' ? { userId: access.actor.id } : {}),
    };
    const [items, total, session] = await this.prisma.client.$transaction([
      this.prisma.client.syncDevice.findMany({
        where,
        select: visible,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.client.syncDevice.count({ where }),
      this.prisma.client.session.findUnique({
        where: { id: access.sessionId },
        select: { desktopDeviceId: true },
      }),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        current: item.id === session?.desktopDeviceId,
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async revoke(access: DeviceAccess, id: string, reason: string) {
    return this.prisma.client.$transaction(async (tx) => {
      await lockSchool(tx, access.schoolId);
      const device = await tx.syncDevice.findFirst({
        where: {
          id,
          schoolId: access.schoolId,
          ...(!managesSchool(access.role) ? { userId: access.actor.id } : {}),
        },
      });
      // Do not reveal other schools' devices or other users' devices.
      if (!device) throw new NotFoundException('Device not found.');
      if (!device.revokedAt) {
        await tx.syncDevice.update({
          where: { id },
          data: {
            revokedAt: new Date(),
            revokedById: access.actor.id,
            revocationReason: reason,
          },
        });
      }
      const removed = await tx.session.deleteMany({
        where: { desktopDeviceId: id },
      });
      if (!device.revokedAt || removed.count) {
        await writeAudit(tx, access.actor, {
          action: 'ACCESS_CHANGED',
          entityType: 'sync.device.revoke',
          entityId: id,
          schoolId: access.schoolId,
          newValues: {
            reason: device.revocationReason ?? reason,
            sessionsRemoved: removed.count,
          },
        });
      }
      return { id, revoked: true };
    });
  }

  /** Future pull/push/lease handlers must call through the exported guard. */
  async requireBoundDevice(
    schoolId: string,
    userId: string,
    sessionId: string,
  ) {
    if (!schoolId || !userId || !sessionId)
      throw new UnauthorizedException('Sign in and select a school.');
    // Always reload the binding, including for sessions cached by an auth client.
    const session = await this.prisma.client.session.findUnique({
      where: { id: sessionId },
      include: { desktopDevice: true },
    });
    if (
      !session ||
      session.userId !== userId ||
      session.expiresAt <= new Date()
    )
      throw new UnauthorizedException('Sign in again.');
    const device = session.desktopDevice;
    if (
      session.clientPlatform !== 'desktop' ||
      session.impersonatedBy ||
      !device ||
      device.schoolId !== schoolId ||
      device.userId !== userId ||
      device.revokedAt
    ) {
      throw new ForbiddenException({
        error: 'SYNC_DEVICE_REQUIRED',
        message: 'Register an active installation before syncing.',
      });
    }
    return device;
  }
}
