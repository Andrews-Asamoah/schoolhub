import {Body,Controller,Get,Header,Param,Patch,Post,Query,StreamableFile,UploadedFile,UseGuards,UseInterceptors} from "@nestjs/common";
import {FileInterceptor} from "@nestjs/platform-express";
import {Throttle,ThrottlerGuard} from "@nestjs/throttler";
import type {School} from "@prisma/client";
import {z} from "zod";
import {CurrentSchool} from "../../common/decorators/current-school.decorator.js";
import {CurrentSchoolRole} from "../../common/decorators/current-school-role.decorator.js";
import {AuditActorParam} from "../../common/audit/audit-actor.decorator.js";
import type {AuditActor} from "../../common/audit/audit.js";
import {Roles} from "../../common/decorators/roles.decorator.js";
import {RolesGuard} from "../../common/guards/roles.guard.js";
import {SchoolTenantGuard} from "../../common/guards/school-tenant.guard.js";
import {ZodValidationPipe} from "../../common/pipes/zod-validation.pipe.js";
import {ExcuseRequestsService} from "./excuse-requests.service.js";
const createSchema=z.object({studentId:z.string().min(1),fromDate:z.iso.date(),toDate:z.iso.date(),reason:z.string().trim().min(10).max(2000)});
const listSchema=z.object({page:z.coerce.number().int().min(1).max(100000).default(1),status:z.enum(["ALL","PENDING","APPROVED","REJECTED"]).default("ALL")});
const reviewSchema=z.object({status:z.enum(["APPROVED","REJECTED"]),reason:z.string().trim().min(10).max(1000),expectedVersion:z.number().int().min(1)});
@Controller("attendance/excuse-requests")
@UseGuards(ThrottlerGuard,SchoolTenantGuard,RolesGuard)
export class ExcuseRequestsController{
 constructor(private readonly requests:ExcuseRequestsService){}
 @Get()
 @Roles("guardian","owner","admin","headteacher")
 @Header("Cache-Control","private, no-store")
 list(@CurrentSchool() school:School,@CurrentSchoolRole() role:string,@AuditActorParam() actor:AuditActor,@Query(new ZodValidationPipe(listSchema)) query:z.infer<typeof listSchema>){return this.requests.list(school.id,actor.id,role,query.page,query.status);}
 @Post()
 @Roles("guardian")
 @Throttle({default:{limit:10,ttl:60000}})
 @UseInterceptors(FileInterceptor("file",{limits:{fileSize:5*1024*1024,files:1}}))
 create(@CurrentSchool() school:School,@AuditActorParam() actor:AuditActor,@Body(new ZodValidationPipe(createSchema)) body:z.infer<typeof createSchema>,@UploadedFile() file?:Express.Multer.File){return this.requests.create(school,actor,body,file);}
 @Patch(":id/review")
 @Roles("owner","admin","headteacher")
 review(@CurrentSchool() school:School,@CurrentSchoolRole() role:string,@AuditActorParam() actor:AuditActor,@Param("id") id:string,@Body(new ZodValidationPipe(reviewSchema)) body:z.infer<typeof reviewSchema>){return this.requests.review(school.id,actor,role,id,body);}
 @Get(":id/evidence")
 @Roles("guardian","owner","admin","headteacher")
 @Header("Cache-Control","private, no-store")
 @Header("X-Content-Type-Options","nosniff")
 async evidence(@CurrentSchool() school:School,@CurrentSchoolRole() role:string,@AuditActorParam() actor:AuditActor,@Param("id") id:string){const file=await this.requests.attachment(school.id,actor.id,role,id,actor);return new StreamableFile(file.body,{type:file.mime,disposition:`attachment; filename="absence-evidence.${file.mime==="application/pdf"?"pdf":"png"}"`});}
}
