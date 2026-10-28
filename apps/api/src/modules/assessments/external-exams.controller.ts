import {Body,Controller,Get,Param,Patch,Post,Put,UseGuards} from "@nestjs/common";
import type {School} from "@prisma/client";
import type {z} from "zod";
import {SchoolTenantGuard} from "../../common/guards/school-tenant.guard.js";
import {RolesGuard} from "../../common/guards/roles.guard.js";
import {Roles} from "../../common/decorators/roles.decorator.js";
import {CurrentSchool} from "../../common/decorators/current-school.decorator.js";
import {CurrentSchoolRole} from "../../common/decorators/current-school-role.decorator.js";
import {CurrentUser,type AuthenticatedUser} from "../../common/decorators/current-user.decorator.js";
import {ZodValidationPipe} from "../../common/pipes/zod-validation.pipe.js";
import {externalExamCreateSchema,externalIndexSchema,externalResultBatchSchema}
  from "./external-exams.schemas.js";
import {ExternalExamsService} from "./external-exams.service.js";

/** All routes are school-tenanted and staff-only. There is no public BECE checker. */
@Controller("external-exams")
@UseGuards(SchoolTenantGuard,RolesGuard)
export class ExternalExamsController {
  constructor(private readonly exams:ExternalExamsService){}

  @Get()
  @Roles("owner","admin","headteacher","teacher")
  list(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined){
    return this.exams.list(school.id,user.id,role);
  }

  @Post("bece")
  @Roles("owner","admin")
  create(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined,
    @Body(new ZodValidationPipe(externalExamCreateSchema)) body:z.infer<typeof externalExamCreateSchema>){
    return this.exams.create(school.id,user.id,role,body);
  }

  @Patch(":id/open")
  @Roles("owner","admin")
  open(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined,@Param("id") id:string){
    return this.exams.open(school.id,user.id,role,id);
  }

  @Get(":id/summary")
  @Roles("owner","admin","headteacher","teacher")
  summary(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined,@Param("id") id:string){
    return this.exams.summary(school.id,user.id,role,id);
  }

  @Get("papers/:id")
  @Roles("owner","admin","headteacher","teacher")
  paper(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined,@Param("id") id:string){
    return this.exams.sheet(school.id,user.id,role,id);
  }

  @Put("candidates/:id/index")
  @Roles("owner","admin")
  index(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined,@Param("id") id:string,
    @Body(new ZodValidationPipe(externalIndexSchema)) body:z.infer<typeof externalIndexSchema>){
    return this.exams.indexNumber(school.id,user.id,role,id,body.indexNumber,body.expectedVersion);
  }

  @Put("results")
  @Roles("owner","admin","teacher")
  record(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined,
    @Body(new ZodValidationPipe(externalResultBatchSchema)) body:z.infer<typeof externalResultBatchSchema>){
    return this.exams.save(school.id,user.id,role,body);
  }

  @Patch(":id/lock")
  @Roles("headteacher")
  lock(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined,@Param("id") id:string){
    return this.exams.lock(school.id,user.id,role,id);
  }
}
