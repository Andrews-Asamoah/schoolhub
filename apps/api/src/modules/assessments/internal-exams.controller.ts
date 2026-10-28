import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from "@nestjs/common";
import type { School } from "@prisma/client";
import type { z } from "zod";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { createMockSchema, mockMarkSchema } from "./internal-exams.schemas.js";
import { InternalExamsService } from "./internal-exams.service.js";

/** Internal mock examinations only. External WAEC/BECE results never use these endpoints. */
@Controller("internal-exams")
@UseGuards(SchoolTenantGuard,RolesGuard)
export class InternalExamsController {
  constructor(private readonly exams:InternalExamsService){}

  @Get()
  @Roles("owner","admin","headteacher","teacher")
  list(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined){
    return this.exams.list(school.id,user.id,role);
  }

  @Post("mocks")
  @Roles("owner","admin","headteacher")
  createMock(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined,
    @Body(new ZodValidationPipe(createMockSchema)) input:z.infer<typeof createMockSchema>){
    return this.exams.create(school.id,user.id,role,input.classId);
  }

  @Patch(":id/open")
  @Roles("owner","admin","headteacher")
  open(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined,@Param("id") id:string){
    return this.exams.open(school.id,user.id,role,id);
  }

  @Get("papers/:id")
  @Roles("owner","admin","headteacher","teacher")
  sheet(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined,@Param("id") id:string){
    return this.exams.sheet(school.id,user.id,role,id);
  }

  @Put("marks")
  @Roles("teacher")
  save(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined,
    @Body(new ZodValidationPipe(mockMarkSchema)) body:z.infer<typeof mockMarkSchema>){
    return this.exams.save(school.id,user.id,role,body);
  }

  @Patch("papers/:id/finalize")
  @Roles("teacher")
  finalize(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined,@Param("id") id:string){
    return this.exams.finalizePaper(school.id,user.id,role,id);
  }

  @Patch(":id/lock")
  @Roles("owner","admin","headteacher")
  lock(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined,@Param("id") id:string){
    return this.exams.lock(school.id,user.id,role,id);
  }
}
