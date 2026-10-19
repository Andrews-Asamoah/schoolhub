import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { SchoolsService } from "./schools.service.js";

@Controller("schools/public")
export class SchoolsPublicController {
  constructor(private readonly schoolsService: SchoolsService) {}

  // Needed before sign-in (login branding). Without this the global auth guard
  // answers 401 to logged-out visitors.
  @AllowAnonymous()
  @Get(":subdomain")
  getPublicSchool(@Param("subdomain") subdomain: string) {
    return this.schoolsService.getPublicSchoolBySubdomain(subdomain);
  }

  /** Sign-in helper: username (or old admission number) -> the login email. */
  @AllowAnonymous()
  @Post(":subdomain/resolve-login")
  resolveLogin(
    @Param("subdomain") subdomain: string,
    @Body() body: { identifier?: unknown },
    @Req() req: { ip?: string },
  ) {
    return this.schoolsService.resolveLoginIdentifier(
      subdomain,
      typeof body?.identifier === "string" ? body.identifier : "",
      req.ip ?? "unknown",
    );
  }
}
