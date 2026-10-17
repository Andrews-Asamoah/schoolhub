import { Controller, Get, Param } from "@nestjs/common";
import { SchoolsService } from "./schools.service.js";

@Controller("schools/public")
export class SchoolsPublicController {
  constructor(private readonly schoolsService: SchoolsService) {}

  @Get(":subdomain")
  getPublicSchool(@Param("subdomain") subdomain: string) {
    return this.schoolsService.getPublicSchoolBySubdomain(subdomain);
  }
}
