import { schoolAccessIdentifierSchema } from '@schoolhub/shared';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { SchoolsService } from './schools.service.js';
import { R2Service } from '../storage/r2.service.js';
import { MAX_IMAGE_BYTES, sniffImage } from '../storage/image-validation.js';

@Controller('schools/public')
export class SchoolsPublicController {
  constructor(
    private readonly schoolsService: SchoolsService,
    private readonly r2: R2Service,
  ) {}

  // Needed before sign-in (login branding). Without this the global auth guard
  // answers 401 to logged-out visitors.
  @AllowAnonymous()
  @Get(':subdomain')
  getPublicSchool(@Param('subdomain') subdomain: string) {
    return this.schoolsService.getPublicSchoolBySubdomain(subdomain);
  }

  /** Serve uploaded branding through the pinned desktop API. */
  @AllowAnonymous()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':subdomain/logo')
  @Header('Cache-Control', 'public, max-age=300')
  @Header('X-Content-Type-Options', 'nosniff')
  async getPublicSchoolLogo(@Param('subdomain') subdomain: string) {
    const school = await this.schoolsService.getPublicSchoolBySubdomain(subdomain);
    const key = this.r2.keyFromUrl(school.logo);
    const prefix = `${this.r2.keys.schoolPrefix(school.id)}images/logo/`;
    if (!key?.startsWith(prefix)) throw new NotFoundException('School logo not found.');
    const bytes = await this.r2.read(key, MAX_IMAGE_BYTES);
    const image = sniffImage(bytes);
    if (!image) throw new NotFoundException('School logo not found.');
    return new StreamableFile(bytes, { type: image.mime, disposition: 'inline' });
  }

  /** Resolve an exact school code or address prefix before mobile or desktop sign-in. */
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
