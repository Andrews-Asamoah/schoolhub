import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  registerSyncDeviceSchema,
  revokeSyncDeviceSchema,
  syncDeviceQuerySchema,
  type RegisterSyncDeviceInput,
  type SyncDeviceQuery,
} from '@schoolhub/shared';
import { SchoolTenantGuard } from '../../common/guards/school-tenant.guard.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AllowInactiveSubscription } from '../../common/decorators/allow-inactive-subscription.decorator.js';
import { actorFromRequest } from '../../common/audit/audit.js';
import { SyncDeviceService, type DeviceAccess } from './sync-device.service.js';

function access(request: any): DeviceAccess {
  return {
    schoolId: request.school.id,
    actor: actorFromRequest(request),
    role: request.schoolRole ?? request.membership?.role,
    sessionId: request.session.session.id,
  };
}
@Controller('sync/devices')
@UseGuards(SchoolTenantGuard)
export class SyncDeviceController {
  constructor(private readonly devices: SyncDeviceService) {}

  @Post()
  register(
    @Req() request: any,
    @Body(new ZodValidationPipe(registerSyncDeviceSchema))
    input: RegisterSyncDeviceInput,
  ) {
    return this.devices.register(
      access(request),
      input,
      request.headers['x-schoolhub-client-version'],
    );
  }

  @Get()
  @AllowInactiveSubscription()
  list(
    @Req() request: any,
    @Query(new ZodValidationPipe(syncDeviceQuerySchema)) query: SyncDeviceQuery,
  ) {
    return this.devices.list(access(request), query);
  }

  @Post(':id/revoke')
  @AllowInactiveSubscription()
  revoke(
    @Req() request: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(revokeSyncDeviceSchema))
    input: { reason: string },
  ) {
    return this.devices.revoke(access(request), id, input.reason);
  }
}
