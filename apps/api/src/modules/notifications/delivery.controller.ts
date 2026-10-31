import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { School } from '@prisma/client';
import type { Request } from 'express';
import { z } from 'zod';
import { CurrentSchool } from '../../common/decorators/current-school.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { SchoolTenantGuard } from '../../common/guards/school-tenant.guard.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { NotificationDeliveryService } from './delivery.service.js';
const preferences = z.object({
  emailEnabled: z.boolean(),
  smsEnabled: z.boolean(),
});
const settings = preferences.extend({
  emailDailyLimit: z.number().int().min(0).max(100000),
  smsDailyLimit: z.number().int().min(0).max(10000),
});
const paging = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
export { NotificationDeliveryAdminGuard } from './delivery-admin.guard.js';
import { NotificationDeliveryAdminGuard } from './delivery-admin.guard.js';
@Controller('notifications/delivery')
@UseGuards(SchoolTenantGuard, RolesGuard, ThrottlerGuard)
@Roles(
  'owner',
  'admin',
  'headteacher',
  'teacher',
  'accountant',
  'staff',
  'student',
  'guardian',
)
export class NotificationDeliveryController {
  constructor(private readonly delivery: NotificationDeliveryService) {}
  @Get('preferences') preferences(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.delivery.preferences(school.id, user.id);
  }
  @Patch('preferences')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  setPreferences(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(preferences))
    input: z.infer<typeof preferences>,
  ) {
    return this.delivery.setPreferences(school.id, user.id, input);
  }
  @Get('history') history(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(paging)) input: z.infer<typeof paging>,
  ) {
    return this.delivery.history(school.id, user.id, input.page);
  }
  @Get('school-history')
  @UseGuards(NotificationDeliveryAdminGuard)
  @Roles('owner', 'admin')
  schoolHistory(
    @CurrentSchool() school: School,
    @Query(new ZodValidationPipe(paging)) input: z.infer<typeof paging>,
  ) {
    return this.delivery.history(school.id, undefined, input.page);
  }
  @Post(':id/retry')
  @UseGuards(NotificationDeliveryAdminGuard)
  @Roles('owner', 'admin')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  retry(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(
      new ZodValidationPipe(
        z.object({ reason: z.string().trim().min(10).max(500) }),
      ),
    )
    input: { reason: string },
  ) {
    return this.delivery.retryEmail(school.id, user.id, id, input.reason);
  }
  @Get('settings')
  @UseGuards(NotificationDeliveryAdminGuard)
  @Roles('owner', 'admin')
  settings(@CurrentSchool() school: School) {
    return this.delivery.settings(school.id);
  }
  @Patch('settings')
  @UseGuards(NotificationDeliveryAdminGuard)
  @Roles('owner', 'admin')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  setSettings(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(settings)) input: z.infer<typeof settings>,
  ) {
    return this.delivery.setSettings(school.id, user.id, input);
  }
}
@Controller('webhooks/resend')
@AllowAnonymous()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 300, ttl: 60000 } })
export class ResendWebhookController {
  constructor(private readonly delivery: NotificationDeliveryService) {}
  @Post() receive(@Req() request: Request & { rawBody?: Buffer }) {
    return this.delivery.webhook(request.rawBody, {
      'svix-id': request.get('svix-id'),
      'svix-timestamp': request.get('svix-timestamp'),
      'svix-signature': request.get('svix-signature'),
    });
  }
}
