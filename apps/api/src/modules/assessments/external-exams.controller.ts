import {BadRequestException,Body,Controller,Get,Header,Param,Patch,Post,Put,Res,UploadedFile,UseGuards,UseInterceptors} from "@nestjs/common";
import {FileInterceptor} from "@nestjs/platform-express";
import type {Response} from "express";
import {BECE_IMPORT_MAX_BYTES} from "./external-bece-import.xlsx.js";
import {ExternalBeceImportService} from "./external-bece-import.service.js";
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
  constructor(private readonly exams:ExternalExamsService,
    private readonly imports:ExternalBeceImportService){}

  @Get(":id/import/template/:paperId")
  @Roles("owner","admin")
  async downloadTemplate(@CurrentSchool() school:School,
    @CurrentSchoolRole() role:string|undefined,
    @Param("id") id:string,@Param("paperId") paperId:string,@Res() res:Response){
    const file=await this.imports.template(school.id,role,id,paperId);
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Cache-Control","private, no-store");
    res.setHeader("X-Content-Type-Options","nosniff");
    res.setHeader("Content-Disposition",'attachment; filename="bece-results-template.xlsx"');
    res.setHeader("Content-Length",file.length);
    res.end(file);
  }

  @Post(":id/import/preview")
  @Header("Cache-Control","no-store")
  @Roles("owner","admin")
  @UseInterceptors(FileInterceptor("file",{limits:{fileSize:BECE_IMPORT_MAX_BYTES,files:1}}))
  previewImport(@CurrentSchool() school:School,@CurrentSchoolRole() role:string|undefined,
    @Param("id") id:string,@UploadedFile() file:Express.Multer.File|undefined){
    if(!file)throw new BadRequestException("Choose an Excel .xlsx workbook to preview.");
    return this.imports.preview(school.id,role,id,file);
  }

  @Post(":id/import/commit")
  @Header("Cache-Control","no-store")
  @Roles("owner","admin")
  @UseInterceptors(FileInterceptor("file",{limits:{fileSize:BECE_IMPORT_MAX_BYTES,files:1}}))
  commitImport(@CurrentSchool() school:School,@CurrentUser() user:AuthenticatedUser,
    @CurrentSchoolRole() role:string|undefined,@Param("id") id:string,
    @UploadedFile() file:Express.Multer.File|undefined,@Body("sha256") sha256:string|undefined){
    if(!file)throw new BadRequestException("Re-upload the same Excel .xlsx workbook used in the preview.");
    if(!sha256)throw new BadRequestException("Preview checksum is required before committing.");
    return this.imports.commit(school.id,user.id,role,id,file,sha256);
  }

  @Get(":id/import/history")
  @Roles("owner","admin")
  getImportHistory(@CurrentSchool() school:School,@CurrentSchoolRole() role:string|undefined,
    @Param("id") id:string){
    return this.imports.history(school.id,role,id);
  }

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
