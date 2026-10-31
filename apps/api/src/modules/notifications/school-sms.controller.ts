import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Put,
  Query,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { School } from '@prisma/client';
import {
  schoolHubtelConnectionSchema,
  type SchoolHubtelConnectionInput,
} from '@schoolhub/shared';
import { CurrentSchool } from '../../common/decorators/current-school.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { SchoolTenantGuard } from '../../common/guards/school-tenant.guard.js';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { NotificationDeliveryAdminGuard } from './delivery-admin.guard.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AuditActorParam } from '../../common/audit/audit-actor.decorator.js';
import type { AuditActor } from '../../common/audit/audit.js';
import { SchoolSmsService } from './school-sms.service.js';
@Controller('notifications/delivery/sms-account')
@UseGuards(
  SchoolTenantGuard,
  RolesGuard,
  NotificationDeliveryAdminGuard,
  ThrottlerGuard,
)
@Roles('owner', 'admin')
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class SchoolSmsController {
  constructor(private readonly sms: SchoolSmsService) {}
  @Get() @Header('Cache-Control', 'no-store') status(
    @CurrentSchool() school: School,
    @Query('organizationId') expectedOrganization: string | undefined,
  ) {
    if (expectedOrganization !== school.organizationId)
      throw new ForbiddenException(
        'School SMS context changed. Reload the selected school and try again.',
      );
    return this.sms.status(school.id);
  }
  @Put() @Header('Cache-Control', 'no-store') save(
    @CurrentSchool() school: School,
    @Query('organizationId') expectedOrganization: string | undefined,
    @AuditActorParam() actor: AuditActor,
    @Body(new ZodValidationPipe(schoolHubtelConnectionSchema))
    input: SchoolHubtelConnectionInput,
  ) {
    if (expectedOrganization !== school.organizationId)
      throw new ForbiddenException(
        'School SMS context changed. Reload the selected school and try again.',
      );
    return this.sms.save(school.id, actor, input);
  }
  @Delete() @Header('Cache-Control', 'no-store') disconnect(
    @CurrentSchool() school: School,
    @Query('organizationId') expectedOrganization: string | undefined,
    @AuditActorParam() actor: AuditActor,
  ) {
    if (expectedOrganization !== school.organizationId)
      throw new ForbiddenException(
        'School SMS context changed. Reload the selected school and try again.',
      );
    return this.sms.disconnect(school.id, actor);
  }
}
@Controller('super-admin/schools')
@UseGuards(SuperAdminGuard, ThrottlerGuard)
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class SuperAdminSchoolSmsController {
  constructor(private readonly sms: SchoolSmsService) {}
  @Get(':id/sms') @Header('Cache-Control', 'no-store') status(
    @Param('id') id: string,
  ) {
    return this.sms.status(id);
  }
  @Put(':id/sms') @Header('Cache-Control', 'no-store') save(
    @Param('id') id: string,
    @AuditActorParam() actor: AuditActor,
    @Body(new ZodValidationPipe(schoolHubtelConnectionSchema))
    input: SchoolHubtelConnectionInput,
  ) {
    return this.sms.save(id, actor, input);
  }
  @Delete(':id/sms') @Header('Cache-Control', 'no-store') disconnect(
    @Param('id') id: string,
    @AuditActorParam() actor: AuditActor,
  ) {
    return this.sms.disconnect(id, actor);
  }
}
