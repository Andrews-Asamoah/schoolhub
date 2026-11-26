import { schoolAccessIdentifierSchema } from '@schoolhub/shared';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { SchoolsService } from './schools.service.js';

@Controller('schools/public')
export class SchoolsPublicController {
  constructor(private readonly schoolsService: SchoolsService) {}

  // Needed before sign-in (login branding). Without this the global auth guard
  // answers 401 to logged-out visitors.
  @AllowAnonymous()
  @Get(':subdomain')
  getPublicSchool(@Param('subdomain') subdomain: string) {
    return this.schoolsService.getPublicSchoolBySubdomain(subdomain);
  }

  /** Resolve an exact school code or address prefix before mobile sign-in. */
  @AllowAnonymous()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('access/:identifier')
  @Header('Cache-Control', 'no-store')
  findSchoolForAccess(
    @Param('identifier', new ZodValidationPipe(schoolAccessIdentifierSchema))
    identifier: string,
  ) {
    return this.schoolsService.findSchoolsForAccess(identifier);
  }

  /** Sign-in helper: username (or old admission number) -> the login email. */
  @AllowAnonymous()
  @Post(':subdomain/resolve-login')
  resolveLogin(
    @Param('subdomain') subdomain: string,
    @Body() body: { identifier?: unknown },
    @Req() req: { ip?: string },
  ) {
    return this.schoolsService.resolveLoginIdentifier(
      subdomain,
      typeof body?.identifier === 'string' ? body.identifier : '',
      req.ip ?? 'unknown',
    );
  }
}
