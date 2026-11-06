import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { SchoolTenantGuard } from '../../common/guards/school-tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { NotificationDeliveryAdminGuard } from './delivery-admin.guard.js';
import { SchoolSmsService } from './school-sms.service.js';
import {
  SchoolSmsController,
  SuperAdminSchoolSmsController,
} from './school-sms.controller.js';
@Module({
  imports: [PrismaModule],
  controllers: [SchoolSmsController, SuperAdminSchoolSmsController],
  providers: [
    SchoolSmsService,
    SchoolTenantGuard,
    RolesGuard,
    NotificationDeliveryAdminGuard,
  ],
  exports: [SchoolSmsService],
})
export class SchoolSmsModule {}
