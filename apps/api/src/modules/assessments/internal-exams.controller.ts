import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Put, Res, UseGuards } from "@nestjs/common";
import type { School } from "@prisma/client";
import type { z } from "zod";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { createMockSchema, mockMarkSchema } from "./internal-exams.schemas.js";
import { InternalExamsService } from "./internal-exams.service.js";
import { MockReportService } from "./mock-report.service.js";
import { MockCorrectionService } from "./mock-correction.service.js";
import { mockCorrectionRequestSchema,mockCorrectionDecisionSchema } from "./internal-exams.schemas.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import type { Response } from "express";

/** Internal mock examinations only. External WAEC/BECE results never use these endpoints. */
@Controller("internal-exams")
@UseGuards(SchoolTenantGuard,RolesGuard)
export class InternalExamsController {
  constructor(private readonly exams:InternalExamsService,
    private readonly mockReports:MockReportService,
    private readonly corrections:MockCorrectionService){}

  private recommendation(body:unknown){
    const remark=body&&typeof body==="object"&&"remark" in body
      ?(body as {remark:unknown}).remark:null;
    if(typeof remark!=="string"||remark.trim().length<10||remark.trim().length>2000){
      throw new BadRequestException("Write 10–2000 characters of recommendation.");
    }
    return remark.trim();
  }


  @Get(":id/corrections")
  @Roles("owner","admin","headteacher","teacher")
  listCorrections(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined,@Param("id") id:string){
    return this.corrections.list(school.id,user.id,role,id);
  }

  @Post(":id/corrections")
  @Roles("owner","admin","headteacher","teacher")
  requestCorrection(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined,@Param("id") id:string,
    @Body(new ZodValidationPipe(mockCorrectionRequestSchema)) input:z.infer<typeof mockCorrectionRequestSchema>){
    return this.corrections.request(school.id,user.id,role,id,input);
  }

  @Post("corrections/:id/approve")
  @Roles("headteacher")
  approveCorrection(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined,@Param("id") id:string,
    @Body(new ZodValidationPipe(mockCorrectionDecisionSchema)) input:z.infer<typeof mockCorrectionDecisionSchema>){
    return this.corrections.decide(school.id,user.id,role,id,true,input.reason);
  }

  @Post("corrections/:id/reject")
  @Roles("headteacher")
  rejectCorrection(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined,@Param("id") id:string,
    @Body(new ZodValidationPipe(mockCorrectionDecisionSchema)) input:z.infer<typeof mockCorrectionDecisionSchema>){
    return this.corrections.decide(school.id,user.id,role,id,false,input.reason);
  }

  @Get("grading-systems")
  @Roles("owner","admin","headteacher")
  gradePolicies(@CurrentSchool() school:School,@CurrentSchoolRole() role:string|undefined){
    return this.mockReports.gradingSystems(school.id,role);
  }

  @Post(":id/reports/generate")
  @Roles("owner","admin","headteacher")
  generateReports(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined,@Param("id") id:string,
    @Body() input:{gradingSystemId?:unknown}){
    if(typeof input?.gradingSystemId!=="string"||!input.gradingSystemId.trim()) {
      throw new BadRequestException("Choose a school grading system.");
    }
    return this.mockReports.generate(school.id,user.id,role,id,input.gradingSystemId);
  }

  @Get(":id/reports")
  @Roles("owner","admin","headteacher","teacher")
  reportReview(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined,@Param("id") id:string){
    return this.mockReports.review(school.id,user.id,role,id);
  }

  @Post("reports/:id/recommend")
  @Roles("teacher")
  reportRecommend(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined,@Param("id") id:string,@Body() body:unknown){
    return this.mockReports.recommend(school.id,user.id,role,id,this.recommendation(body));
  }

  @Patch("reports/:id/head-approve")
  @Roles("headteacher")
  reportHeadApprove(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined,@Param("id") id:string,@Body() body:unknown){
    return this.mockReports.headApprove(school.id,user.id,role,id,this.recommendation(body));
  }

  @Post(":id/reports/publish")
  @Roles("owner","admin","headteacher")
  publishReports(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined,@Param("id") id:string){
    return this.mockReports.publish(school.id,user.id,role,id);
  }

  @Get("published/me")
  @Roles("student")
  myPublishedMocs(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser){
    return this.mockReports.published(school.id,user.id,"student");
  }

  @Get("published/guardian")
  @Roles("guardian")
  guardianPublishedMocks(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser){
    return this.mockReports.published(school.id,user.id,"guardian");
  }

  @Get("published/me/:id/pdf")
  @Roles("student")
  async myMockPdf(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @Param("id") id:string,@Res() res:Response){
    const file=await this.mockReports.pdf(school.id,user.id,id,"student");
    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Cache-Control","private, no-store");
    res.setHeader("X-Content-Type-Options","nosniff");
    res.setHeader("Content-Disposition",'attachment; filename="'+file.name+'"');
    res.setHeader("Content-Length",file.content.length);
    res.end(file.content);
  }

  @Get("published/guardian/:id/pdf")
  @Roles("guardian")
  async guardianMockPdf(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @Param("id") id:string,@Res() res:Response){
    const file=await this.mockReports.pdf(school.id,user.id,id,"guardian");
    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Cache-Control","private, no-store");
    res.setHeader("X-Content-Type-Options","nosniff");
    res.setHeader("Content-Disposition",'attachment; filename="'+file.name+'"');
    res.setHeader("Content-Length",file.content.length);
    res.end(file.content);
  }


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
