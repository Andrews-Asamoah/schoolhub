import {
  Body,
  Controller,
  Header,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { passwordSchema } from '@schoolhub/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe.js';
import { PasswordRecoveryService } from './password-recovery.service.js';
const requestSchema = z.object({
  email: z.email().max(254),
  school: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,62}$/)
    .optional(),
});
const completeSchema = z.object({
  token: z.string().min(20).max(128),
  newPassword: passwordSchema,
});
@Controller('account/password-recovery')
@AllowAnonymous()
@UseGuards(ThrottlerGuard)
export class PasswordRecoveryController {
  constructor(private readonly recovery: PasswordRecoveryService) {}
  @Post('request')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 600000 } })
  request(
    @Body(new ZodValidationPipe(requestSchema))
    input: z.infer<typeof requestSchema>,
    @Req() request: Request,
  ) {
    return this.recovery.request(
      input.email,
      request.get('origin'),
      input.school,
    );
  }
  @Post('complete')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  complete(
    @Body(new ZodValidationPipe(completeSchema))
    input: z.infer<typeof completeSchema>,
    @Req() request: Request,
  ) {
    return this.recovery.complete(input.token, input.newPassword, {
      ip: request.ip,
      userAgent: request.get('user-agent'),
    });
  }
}
