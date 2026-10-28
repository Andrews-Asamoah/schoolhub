import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from "@nestjs/common";
import {Prisma} from "@prisma/client";
import type {z} from "zod";
import {PrismaService} from "../../prisma/prisma.service.js";
import {TeacherScopeService} from "../../common/scope/teacher-scope.service.js";
import {resultSummary} from "./external-exams.js";
import type {externalExamCreateSchema,externalResultBatchSchema} from "./external-exams.schemas.js";

type CreateInput=z.infer<typeof externalExamCreateSchema>;
type BatchInput=z.infer<typeof externalResultBatchSchema>;
type Role=string|undefined;
@Injectable()
export class ExternalExamsService {
  constructor(private readonly prisma:PrismaService,private readonly scope:TeacherScopeService){}

  private canManage(role:Role){
    if(role!=="owner"&&role!=="admin")throw new ForbiddenException(
      "Only school administrators can create or open an external examination.");
  }
  private async canRead(schoolId:string,userId:string,role:Role,classId:string){
    if(["owner","admin","headteacher"].includes(role??""))return;
    if(role!=="teacher")throw new ForbiddenException("External examination records are staff-only.");
    const a=await this.scope.getAssignments(schoolId,userId);
    if(!a.teacherId||!a.classTeacherClassIds.includes(classId)){
      throw new ForbiddenException("Only the appointed class teacher may read external results.");
    }
  }
  private async canWrite(schoolId:string,userId:string,role:Role,classId:string){
    if(role==="owner"||role==="admin")return;
    if(role!=="teacher")throw new ForbiddenException("Result entry requires administrator or class teacher.");
    const a=await this.scope.getAssignments(schoolId,userId);
    if(!a.teacherId||!a.classTeacherClassIds.includes(classId)){
      throw new ForbiddenException("Only the appointed class teacher may transcribe external results.");
    }
  }

  async list(schoolId:string,userId:string,role:Role){
    const manager=["owner","admin","headteacher"].includes(role??"");
    if(!manager&&role!=="teacher")throw new ForbiddenException("External examinations are staff-only.");
    const scope=manager?null:await this.scope.getAssignments(schoolId,userId);
    const classIds=scope?.teacherId?scope.classTeacherClassIds:[];
    if(!manager&&!classIds.length)return [];
    return this.prisma.client.externalExamSession.findMany({
      where:{schoolId,...(manager?{}:{classId:{in:classIds}})},
      select:{id:true,name:true,examYear:true,status:true,createdAt:true,openedAt:true,lockedAt:true,
        class:{select:{id:true,name:true,level:true}},
        academicYear:{select:{id:true,name:true}},
        _count:{select:{candidates:true,papers:true}},
        papers:{orderBy:{codeSnapshot:"asc"},select:{id:true,subjectId:true,
          nameSnapshot:true,codeSnapshot:true}},
      },orderBy:[{examYear:"desc"},{createdAt:"desc"}],take:100,
    });
  }

  async create(schoolId:string,userId:string,role:Role,input:CreateInput){
    this.canManage(role);
    const [year,classroom,enrollments]=await Promise.all([
      this.prisma.client.academicYear.findFirst({
        where:{id:input.academicYearId,schoolId},select:{id:true,name:true},
      }),
      this.prisma.client.class.findFirst({
        where:{id:input.classId,schoolId,deletedAt:null},
        select:{id:true,name:true,level:true,isGraduatingClass:true,academicYearId:true,
          subjects:{where:{subject:{deletedAt:null}},select:{
            subject:{select:{id:true,name:true,code:true}},
          }}},
      }),
      this.prisma.client.enrollment.findMany({
        where:{classId:input.classId,academicYearId:input.academicYearId,
          status:{in:["ACTIVE","COMPLETED"]},student:{schoolId,deletedAt:null}},
        select:{studentId:true,student:{select:{
          admissionNumber:true,profile:{select:{firstName:true,lastName:true}},
        }}},orderBy:{studentId:"asc"},
      }),
    ]);
    if(!year||!classroom)throw new NotFoundException("Academic year or class does not belong to this school.");
    if(classroom.academicYearId&&classroom.academicYearId!==year.id)
      throw new BadRequestException("The class must belong to the selected academic year.");
    if(!classroom.isGraduatingClass&&!/^JHS\s*3$/i.test(classroom.level.trim()))
      throw new BadRequestException("BECE recording is restricted to graduating JHS 3 classes.");
    const roster=[...new Map(enrollments.map(x=>[x.studentId,x])).values()];
    if(!roster.length||!classroom.subjects.length)
      throw new BadRequestException("Enrol graduating candidates and assign subjects first.");
    return this.prisma.client.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}),hashtext(${input.classId}))`;
      const duplicate=await tx.externalExamSession.findFirst({
        where:{schoolId,classId:input.classId,examYear:input.examYear},select:{id:true},
      });
      if(duplicate)throw new ConflictException("This class already has a BECE register for the selected examination year.");
      const created=await tx.externalExamSession.create({
        data:{schoolId,academicYearId:year.id,classId:classroom.id,
          examYear:input.examYear,name:"BECE "+input.examYear,createdById:userId,
          candidates:{create:roster.map(x=>({
            studentId:x.studentId,
            nameSnapshot:[x.student.profile.firstName,x.student.profile.lastName].filter(Boolean).join(" "),
            admissionNumberSnapshot:x.student.admissionNumber,
          }))},
          papers:{create:classroom.subjects.map(x=>({
            subjectId:x.subject.id,nameSnapshot:x.subject.name,codeSnapshot:x.subject.code,
          }))},
        },select:{id:true,name:true,status:true,_count:{select:{candidates:true,papers:true}}},
      });
      await tx.auditLog.create({data:{schoolId,userId,action:"CREATE",
        entityType:"EXTERNAL_BECE_SESSION",entityId:created.id,
        newValues:{examYear:input.examYear,classId:classroom.id,
          academicYearId:year.id,candidates:roster.length,subjects:classroom.subjects.length,
          source:"SCHOOL_ENTERED_UNVERIFIED"}}});
      return created;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
  }

  async open(schoolId:string,userId:string,role:Role,sessionId:string){
    this.canManage(role);
    return this.prisma.client.$transaction(async tx=>{
      const changed=await tx.externalExamSession.updateMany({
        where:{id:sessionId,schoolId,status:"DRAFT"},
        data:{status:"OPEN",openedAt:new Date()},
      });
      if(changed.count!==1)throw new ConflictException("Only a draft BECE register can be opened.");
      await tx.auditLog.create({data:{schoolId,userId,action:"UPDATE",
        entityType:"EXTERNAL_BECE_SESSION",entityId:sessionId,newValues:{status:"OPEN"}}});
      return {id:sessionId,status:"OPEN"};
    });
  }

  async sheet(schoolId:string,userId:string,role:Role,paperId:string){
    const paper=await this.prisma.client.externalExamPaper.findFirst({
      where:{id:paperId,session:{schoolId}},
      select:{id:true,subjectId:true,nameSnapshot:true,codeSnapshot:true,
        session:{select:{id:true,name:true,examYear:true,status:true,classId:true,
          candidates:{orderBy:{nameSnapshot:"asc"},
            select:{id:true,nameSnapshot:true,admissionNumberSnapshot:true,
              indexNumber:true,version:true,
              results:{where:{paperId},select:{
                id:true,status:true,grade:true,version:true,sourceReference:true,
              }},
            }},
        }},
      },
    });
    if(!paper)throw new NotFoundException("External examination paper not found.");
    await this.canRead(schoolId,userId,role,paper.session.classId);
    const editable=paper.session.status==="OPEN"&&
      (role==="owner"||role==="admin"||
        (role==="teacher"&&(await this.scope.getAssignments(schoolId,userId)).classTeacherClassIds.includes(paper.session.classId)));
    return {
      paper:{id:paper.id,name:paper.nameSnapshot,code:paper.codeSnapshot},
      session:{id:paper.session.id,name:paper.session.name,examYear:paper.session.examYear,
        status:paper.session.status},
      canEdit:editable,
      candidates:paper.session.candidates.map(x=>({
        id:x.id,name:x.nameSnapshot,admissionNumber:x.admissionNumberSnapshot,
        indexNumber:x.indexNumber,indexVersion:x.version,
        status:x.results[0]?.status??null,grade:x.results[0]?.grade??null,
        version:x.results[0]?.version??0,sourceReference:x.results[0]?.sourceReference??null,
      })),
    };
  }

  async indexNumber(schoolId:string,userId:string,role:Role,candidateId:string,
    value:string,expectedVersion:number){
    if(role!=="owner"&&role!=="admin")throw new ForbiddenException("Only school administrators may enter candidate index numbers.");
    const candidate=await this.prisma.client.externalExamCandidate.findFirst({
      where:{id:candidateId,session:{schoolId}},select:{sessionId:true},
    });
    if(!candidate)throw new NotFoundException("BECE candidate not found.");
    return this.prisma.client.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}),hashtext(${candidate.sessionId}))`;
      const row=await tx.externalExamCandidate.findFirst({
        where:{id:candidateId,session:{schoolId,status:"OPEN"}},
        select:{id:true,indexNumber:true,version:true},
      });
      if(!row)throw new ConflictException("Index numbers may be entered only while the register is open.");
      if(row.version!==expectedVersion)throw new ConflictException("Candidate index number has changed. Refresh the register.");
      const outcome=await tx.externalExamCandidate.updateMany({
        where:{id:candidateId,version:expectedVersion},
        data:{indexNumber:value,version:{increment:1}},
      });
      if(outcome.count!==1)throw new ConflictException("Candidate index number changed during this update.");
      await tx.auditLog.create({data:{schoolId,userId,action:"UPDATE",
        entityType:"EXTERNAL_BECE_INDEX",entityId:candidateId,
        oldValues:{indexNumber:row.indexNumber,version:row.version},
        newValues:{indexNumber:value,version:row.version+1}}});
      return {id:candidateId,indexNumber:value,version:row.version+1};
    });
  }

  async save(schoolId:string,userId:string,role:Role,input:BatchInput){
    const paper=await this.prisma.client.externalExamPaper.findFirst({
      where:{id:input.paperId,session:{schoolId}},
      select:{id:true,session:{select:{id:true,classId:true,status:true}}},
    });
    if(!paper)throw new NotFoundException("BECE paper not found.");
    await this.canWrite(schoolId,userId,role,paper.session.classId);
    if(paper.session.status!=="OPEN")throw new ConflictException("External examination results are locked.");
    return this.prisma.client.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}),hashtext(${paper.session.id}))`;
      const state=await tx.externalExamSession.findFirst({
        where:{id:paper.session.id,schoolId,status:"OPEN"},select:{id:true},
      });
      if(!state)throw new ConflictException("External examination is no longer open.");
      const ids=input.entries.map(r=>r.candidateId);
      const candidates=await tx.externalExamCandidate.findMany({
        where:{sessionId:paper.session.id,id:{in:ids}},select:{id:true},
      });
      if(candidates.length!==ids.length)throw new BadRequestException("A selected candidate does not belong to this BECE register.");
      for(const entry of input.entries){
        const old=await tx.externalExamResult.findUnique({
          where:{candidateId_paperId:{candidateId:entry.candidateId,paperId:paper.id}},
          select:{id:true,status:true,grade:true,version:true,sourceReference:true},
        });
        if((old?.version??0)!==entry.expectedVersion)
          throw new ConflictException("BECE results changed since the sheet was opened. Refresh before saving.");
        if(old){
          const changed=await tx.externalExamResult.updateMany({
            where:{id:old.id,version:old.version},
            data:{status:entry.status,grade:entry.grade,sourceReference:input.sourceReference,
              version:{increment:1},recordedById:userId},
          });
          if(changed.count!==1)throw new ConflictException("Result changed during update.");
        }else{
          await tx.externalExamResult.create({data:{
            paperId:paper.id,candidateId:entry.candidateId,status:entry.status,
            grade:entry.grade,sourceReference:input.sourceReference,recordedById:userId,
          }});
        }
        await tx.auditLog.create({data:{schoolId,userId,action:old?"UPDATE":"CREATE",
          entityType:"EXTERNAL_BECE_RESULT",entityId:old?.id??entry.candidateId+":"+paper.id,
          oldValues:old?{status:old.status,grade:old.grade,version:old.version,
            sourceReference:old.sourceReference}:Prisma.DbNull,
          newValues:{paperId:paper.id,candidateId:entry.candidateId,status:entry.status,
            grade:entry.grade,sourceReference:input.sourceReference,version:(old?.version??0)+1}}});
      }
      return {paperId:paper.id,saved:input.entries.length};
    },{timeout:30000});
  }

  async summary(schoolId:string,userId:string,role:Role,sessionId:string){
    const session=await this.prisma.client.externalExamSession.findFirst({
      where:{id:sessionId,schoolId},select:{id:true,examYear:true,name:true,status:true,classId:true,
        candidates:{select:{id:true,indexNumber:true}},
        papers:{orderBy:{codeSnapshot:"asc"},select:{id:true,nameSnapshot:true,codeSnapshot:true,
          results:{select:{candidateId:true,status:true,grade:true}}}},
      },
    });
    if(!session)throw new NotFoundException("BECE register not found.");
    await this.canRead(schoolId,userId,role,session.classId);
    return {id:session.id,name:session.name,examYear:session.examYear,
      status:session.status,source:"SCHOOL_ENTERED_UNVERIFIED",
      candidateCount:session.candidates.length,
      missingIndexNumbers:session.candidates.filter(c=>!c.indexNumber).length,
      papers:session.papers.map(p=>({
        id:p.id,name:p.nameSnapshot,code:p.codeSnapshot,
        ...resultSummary(p.results,session.candidates.length),
      })),
    };
  }

  async lock(schoolId:string,userId:string,role:Role,sessionId:string){
    if(role!=="headteacher")throw new ForbiddenException("Only the headteacher may attest and lock a completed BECE register.");
    return this.prisma.client.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}),hashtext(${sessionId}))`;
      const session=await tx.externalExamSession.findFirst({
        where:{id:sessionId,schoolId,status:"OPEN"},select:{
          id:true,createdById:true,candidates:{select:{id:true,indexNumber:true}},
          papers:{select:{id:true,results:{select:{candidateId:true}}}},
        },
      });
      if(!session)throw new ConflictException("Only an open BECE register can be locked.");
      if(session.createdById===userId)throw new ForbiddenException(
        "The headteacher who created the register cannot independently attest to it.");
      if(!session.candidates.length||!session.papers.length||
        session.candidates.some(c=>!c.indexNumber)||
        session.papers.some(p=>p.results.length!==session.candidates.length||
          new Set(p.results.map(r=>r.candidateId)).size!==session.candidates.length)){
        throw new ConflictException("Enter every candidate index number and a grade or explicit result status for every subject before locking.");
      }
      const time=new Date();
      await tx.externalExamSession.update({
        where:{id:sessionId},data:{status:"LOCKED",lockedAt:time,lockedById:userId},
      });
      await tx.auditLog.create({data:{schoolId,userId,action:"UPDATE",
        entityType:"EXTERNAL_BECE_SESSION",entityId:sessionId,
        newValues:{status:"LOCKED",source:"SCHOOL_ENTERED_UNVERIFIED",
          count:session.candidates.length,lockedAt:time.toISOString(),
          attestation:"Headteacher reviewed school-entered candidate index numbers and result statuses"}}});
      return {id:sessionId,status:"LOCKED",lockedAt:time};
    });
  }
}
