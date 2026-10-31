import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import type { School } from "@prisma/client";
import { z } from "zod";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AcademicRolloverService } from "./academic-rollover.service.js";
import { rolloverPlanSchema, type RolloverPlan } from "./rollover-policy.js";
const decision=z.object({approve:z.boolean(),note:z.string().trim().min(10).max(1000)});
const reason=z.object({reason:z.string().trim().min(10).max(1000)});
@Controller('academics/rollovers')
@UseGuards(SchoolTenantGuard,RolesGuard)
@Roles('owner','admin','headteacher')
export class AcademicRolloverController{
 constructor(private readonly service:AcademicRolloverService){}
 @Get('options') options(@CurrentSchool() school:School){return this.service.options(school.id);}
 @Get('cohort') cohort(@CurrentSchool() school:School,@Query(new ZodValidationPipe(z.object({yearId:z.string().min(1),termId:z.string().min(1)}))) input:{yearId:string;termId:string}){return this.service.cohort(school.id,input.yearId,input.termId);}
 @Get() list(@CurrentSchool() school:School){return this.service.list(school.id);}
 @Post('preview') preview(@CurrentSchool() school:School,@Body(new ZodValidationPipe(rolloverPlanSchema)) plan:RolloverPlan){return this.service.preview(school.id,plan);}
 @Post() submit(@CurrentSchool() school:School,@CurrentUser() actor:AuthenticatedUser,@Body(new ZodValidationPipe(rolloverPlanSchema)) plan:RolloverPlan){return this.service.submit(school.id,actor.id,plan);}
 @Post(':id/decide') @Roles('owner','headteacher') decide(@CurrentSchool() school:School,@CurrentUser() actor:AuthenticatedUser,@Param('id') id:string,@Body(new ZodValidationPipe(decision)) input:z.infer<typeof decision>){return this.service.decide(school.id,actor.id,id,input.approve,input.note);}
 @Post(':id/cancel') cancel(@CurrentSchool() school:School,@CurrentUser() actor:AuthenticatedUser,@Param('id') id:string,@Body(new ZodValidationPipe(reason)) input:z.infer<typeof reason>){return this.service.cancel(school.id,actor.id,id,input.reason);}
 @Post(':id/apply') apply(@CurrentSchool() school:School,@CurrentUser() actor:AuthenticatedUser,@Param('id') id:string){return this.service.apply(school.id,actor.id,id);}
 @Post(':id/request-rollback') requestRollback(@CurrentSchool() school:School,@CurrentUser() actor:AuthenticatedUser,@Param('id') id:string,@Body(new ZodValidationPipe(reason)) input:z.infer<typeof reason>){return this.service.requestRollback(school.id,actor.id,id,input.reason);}
 @Post(':id/decide-rollback') @Roles('owner','headteacher') rollback(@CurrentSchool() school:School,@CurrentUser() actor:AuthenticatedUser,@Param('id') id:string,@Body(new ZodValidationPipe(decision)) input:z.infer<typeof decision>){return this.service.rollback(school.id,actor.id,id,input.approve,input.note);}
}
