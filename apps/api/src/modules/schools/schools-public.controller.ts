import { Controller, Get, Param } from "@nestjs/common";
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
}
