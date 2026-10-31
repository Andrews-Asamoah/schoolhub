import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module.js';
import { JobsModule } from '../../../common/jobs/jobs.module.js';
import { PasswordRecoveryController } from './password-recovery.controller.js';
import { PasswordRecoveryService } from './password-recovery.service.js';
import { PasswordRecoveryWorker } from './password-recovery.worker.js';
import { RecoveryTransport } from './recovery-transport.js';
@Module({
  imports: [PrismaModule, JobsModule],
  controllers: [PasswordRecoveryController],
  providers: [
    PasswordRecoveryService,
    PasswordRecoveryWorker,
    RecoveryTransport,
  ],
})
export class PasswordRecoveryModule {}
