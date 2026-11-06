import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import {
  schoolHubtelConnectionSchema,
  type SchoolHubtelConnectionInput,
} from '@schoolhub/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { writeAudit, type AuditActor } from '../../common/audit/audit.js';
import {
  canEncryptSchoolSms,
  canReadSchoolSms,
  decryptSchoolSms,
  encryptSchoolSms,
} from './school-sms-crypto.js';
export async function storeSchoolSmsConnection(
  tx: Prisma.TransactionClient,
  schoolId: string,
  actor: AuditActor,
  input: SchoolHubtelConnectionInput,
) {
  if (!canEncryptSchoolSms())
    throw new ServiceUnavailableException(
      'School SMS encryption is not configured. Contact the platform administrator.',
    );
  const data = schoolHubtelConnectionSchema.parse(input);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('school-sms'),hashtext(${schoolId}))`;
  if (!(await tx.school.count({ where: { id: schoolId } })))
    throw new NotFoundException('School not found.');
  const id = 'sms_' + randomUUID();
  await tx.schoolSmsConnection.updateMany({
    where: { schoolId, retiredAt: null },
    data: { retiredAt: new Date() },
  });
  await tx.schoolSmsConnection.create({
    data: {
      id,
      schoolId,
      senderId: data.senderId,
      apiBaseUrl: data.apiBaseUrl,
      clientIdHint: '••••' + data.clientId.slice(-4),
      encryptedCredentials: encryptSchoolSms(schoolId, id, {
        clientId: data.clientId,
        clientSecret: data.clientSecret,
      }),
    },
  });
  await tx.schoolNotificationSettings.upsert({
    where: { schoolId },
    create: { schoolId, smsConnectionId: id },
    update: { smsConnectionId: id, smsEnabled: false },
  });
  await writeAudit(tx, actor, {
    action: 'UPDATE',
    entityType: 'school.sms.connected',
    entityId: id,
    schoolId,
    newValues: {
      senderId: data.senderId,
      apiBaseUrl: data.apiBaseUrl,
      schoolFunded: true,
    },
  });
  return { success: true };
}
@Injectable()
export class SchoolSmsService {
  constructor(private readonly prisma: PrismaService) {}
  encryptionReady() {
    return canReadSchoolSms();
  }
  async resolve(
    schoolId: string,
    id: string | null | undefined,
    db: Pick<Prisma.TransactionClient, 'schoolSmsConnection'> = this.prisma
      .client,
  ) {
    if (!id) return null;
    const row = await db.schoolSmsConnection.findFirst({
      where: { id, schoolId, revokedAt: null },
      select: { encryptedCredentials: true, senderId: true, apiBaseUrl: true },
    });
    if (!row?.encryptedCredentials) return null;
    const auth = decryptSchoolSms(schoolId, id, row.encryptedCredentials);
    const parsed = auth
      ? schoolHubtelConnectionSchema.safeParse({
          ...auth,
          senderId: row.senderId,
          apiBaseUrl: row.apiBaseUrl,
        })
      : null;
    return parsed?.success ? parsed.data : null;
  }
  async status(schoolId: string) {
    if (!(await this.prisma.client.school.count({ where: { id: schoolId } })))
      throw new NotFoundException('School not found.');
    const settings =
      await this.prisma.client.schoolNotificationSettings.findUnique({
        where: { schoolId },
        select: { smsConnectionId: true },
      });
    const row = settings?.smsConnectionId
      ? await this.prisma.client.schoolSmsConnection.findFirst({
          where: { id: settings.smsConnectionId, schoolId, revokedAt: null },
          select: {
            id: true,
            senderId: true,
            clientIdHint: true,
            apiBaseUrl: true,
            createdAt: true,
            encryptedCredentials: true,
          },
        })
      : null;
    return {
      configured: !!row?.encryptedCredentials,
      ready: !!(await this.resolve(schoolId, row?.id)),
      encryptionReady: canEncryptSchoolSms(),
      senderId: row?.senderId ?? null,
      clientIdHint: row?.clientIdHint ?? null,
      apiBaseUrl: row?.apiBaseUrl ?? 'https://sms.hubtel.com/v1/messages',
      updatedAt: row?.createdAt ?? null,
      billing: 'SCHOOL_HUBTEL_ACCOUNT' as const,
    };
  }
  async save(
    schoolId: string,
    actor: AuditActor,
    input: SchoolHubtelConnectionInput,
  ) {
    await this.prisma.client.$transaction((tx) =>
      storeSchoolSmsConnection(tx, schoolId, actor, input),
    );
    return this.status(schoolId);
  }
  async disconnect(schoolId: string, actor: AuditActor) {
    await this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('school-sms'),hashtext(${schoolId}))`;
      if (!(await tx.school.count({ where: { id: schoolId } })))
        throw new NotFoundException('School not found.');
      await tx.schoolNotificationSettings.upsert({
        where: { schoolId },
        create: { schoolId },
        update: { smsConnectionId: null, smsEnabled: false },
      });
      await tx.schoolSmsConnection.updateMany({
        where: { schoolId, revokedAt: null },
        data: {
          encryptedCredentials: null,
          revokedAt: new Date(),
          retiredAt: new Date(),
        },
      });
      await tx.notificationDelivery.updateMany({
        where: { schoolId, channel: 'SMS', status: 'PENDING' },
        data: { status: 'SUPPRESSED', reason: 'SMS_ACCOUNT_DISCONNECTED' },
      });
      await tx.notificationDelivery.updateMany({
        where: {
          schoolId,
          channel: 'SMS',
          status: { in: ['ACCEPTED', 'SENDING'] },
        },
        data: {
          status: 'UNKNOWN',
          reason: 'SMS_ACCOUNT_DISCONNECTED',
          nextPollAt: null,
        },
      });
      await writeAudit(tx, actor, {
        action: 'UPDATE',
        entityType: 'school.sms.disconnected',
        entityId: schoolId,
        schoolId,
      });
    });
    return { success: true };
  }
  async eraseRetired(now = new Date()) {
    await this.prisma.client.schoolSmsConnection.updateMany({
      where: {
        retiredAt: { lt: new Date(now.getTime() - 8 * 86400000) },
        encryptedCredentials: { not: null },
      },
      data: { encryptedCredentials: null },
    });
  }
}
