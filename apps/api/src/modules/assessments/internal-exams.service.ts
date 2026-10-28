import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { PrismaService } from "../../prisma/prisma.service.js";
import { TeacherScopeService } from "../../common/scope/teacher-scope.service.js";
import { isSchoolManager } from "../../common/scope/teacher-access.js";
import { mockPercent,validateMockMarks } from "./internal-exams.js";
import type { mockMarkSchema } from "./internal-exams.schemas.js";

@Injectable()
export class InternalExamsService {
  constructor(private readonly prisma: PrismaService,private readonly scope: TeacherScopeService){}

  private async canRead(schoolId:string,userId:string,role:string|undefined,classId:string,subjectId?:string) {
    if(isSchoolManager(role)) return;
    if(role!=="teacher") throw new ForbiddenException("Only authorised school staff may use internal examinations.");
    const a=await this.scope.getAssignments(schoolId,userId);
    const eligible=subjectId ?
      a.subjectAssignments.some(s=>s.classId===classId&&s.subjectId===subjectId)||
        a.classTeacherClassIds.includes(classId) :
      a.classTeacherClassIds.includes(classId)||a.subjectAssignments.some(s=>s.classId===classId);
    if(!eligible)throw new ForbiddenException("You do not teach this class or subject.");
  }

  private async canWrite(schoolId:string,userId:string,role:string|undefined,classId:string,subjectId:string) {
    // Only the assigned SUBJECT teacher, not managers or class teachers without this subject.
    if(role!=="teacher")throw new ForbiddenException("Only the assigned subject teacher may enter mock marks.");
    const a=await this.scope.getAssignments(schoolId,userId);
    if(!a.subjectAssignments.some(s=>s.classId===classId&&s.subjectId===subjectId)){
      throw new ForbiddenException("You are not assigned to this class and subject.");
    }
  }

  async list(schoolId:string,userId:string,role:string|undefined){
    const assignments=role==="teacher" ? await this.scope.getAssignments(schoolId,userId):null;
    if(!isSchoolManager(role)&&role!=="teacher")throw new ForbiddenException();
    const classes=assignments? [...new Set([...assignments.classTeacherClassIds,...assignments.subjectAssignments.map(x=>x.classId)])]:null;
    if(classes&&classes.length===0)return [];
    return this.prisma.client.internalExamSession.findMany({
      where:{schoolId,...(classes?{classId:{in:classes}}:{})},
      orderBy:[{createdAt:"desc"}],
      take:100,
      select:{id:true,name:true,mockNumber:true,status:true,createdAt:true,
        class:{select:{id:true,name:true,level:true}},
        academicYear:{select:{id:true,name:true}},
        term:{select:{id:true,name:true}},
        papers:{select:{id:true,subjectId:true,nameSnapshot:true,codeSnapshot:true,
          maxMarks:true,finalizedAt:true}},
        _count:{select:{candidates:true}},
      },
    });
  }

  async create(schoolId:string,actorId:string,role:string|undefined,classId:string){
    if(!isSchoolManager(role))throw new ForbiddenException("School management creates mock examination sessions.");
    const term=await this.prisma.client.term.findFirst({
      where:{isCurrent:true,academicYear:{isCurrent:true,schoolId}},
      select:{id:true,academicYearId:true},
    });
    if(!term)throw new BadRequestException("Configure a current school year and term first.");
    const [classroom,roster]=await Promise.all([
      this.prisma.client.class.findFirst({
        where:{id:classId,schoolId,deletedAt:null,isActive:true,
          OR:[{academicYearId:term.academicYearId},{academicYearId:null}]},
        select:{id:true,name:true,level:true,isGraduatingClass:true,
          subjects:{where:{subject:{isActive:true,deletedAt:null}},
            select:{subject:{select:{id:true,name:true,code:true}}}}},
      }),
      this.prisma.client.enrollment.findMany({
        where:{classId,academicYearId:term.academicYearId,termId:term.id,
          status:{in:["ACTIVE","COMPLETED"]},student:{schoolId,deletedAt:null}},
        select:{studentId:true,student:{select:{
          admissionNumber:true,profile:{select:{firstName:true,lastName:true}}}}},
      }),
    ]);
    if(!classroom)throw new NotFoundException("Class not found in the current school year.");
    if(!classroom.isGraduatingClass && !/^JHS\s*3$/i.test(classroom.level.trim())){
      throw new BadRequestException("The numbered Mock series is for the final-year JHS 3 class.");
    }
    if(!roster.length)throw new BadRequestException("Enrol pupils in this term before creating Mock 1.");
    if(!classroom.subjects.length)throw new BadRequestException("Assign class subjects before creating a mock.");
    return this.prisma.client.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}),hashtext(${classId}))`;
      const latest=await tx.internalExamSession.aggregate({
        where:{schoolId,academicYearId:term.academicYearId,classId},
        _max:{mockNumber:true},
      });
      const n=(latest._max.mockNumber??0)+1;
      const exam=await tx.internalExamSession.create({
        data:{schoolId,academicYearId:term.academicYearId,termId:term.id,classId,
          mockNumber:n,name:"Mock "+n,createdById:actorId,
          candidates:{create:roster.map(x=>({
            studentId:x.studentId,
            nameSnapshot:[x.student.profile.firstName,x.student.profile.lastName].filter(Boolean).join(" "),
            admissionNumberSnapshot:x.student.admissionNumber,
          }))},
          papers:{create:classroom.subjects.map(x=>({
            subjectId:x.subject.id,nameSnapshot:x.subject.name,
            codeSnapshot:x.subject.code,maxMarks:new Prisma.Decimal(100),
          }))},
        },
        select:{id:true,name:true,mockNumber:true,status:true,
          _count:{select:{candidates:true,papers:true}}},
      });
      await tx.auditLog.create({data:{schoolId,userId:actorId,action:"CREATE",
        entityType:"INTERNAL_MOCK",entityId:exam.id,
        newValues:{classId,academicYearId:term.academicYearId,termId:term.id,
          mockNumber:n,candidateCount:roster.length,paperCount:classroom.subjects.length}}});
      return exam;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }

  async open(schoolId:string,actorId:string,role:string|undefined,sessionId:string){
    if(!isSchoolManager(role))throw new ForbiddenException();
    return this.prisma.client.$transaction(async tx=>{
      const exam=await tx.internalExamSession.updateMany({
        where:{id:sessionId,schoolId,status:"DRAFT"},
        data:{status:"OPEN",openedAt:new Date()},
      });
      if(exam.count!==1)throw new ConflictException("Only a draft mock may be opened.");
      await tx.auditLog.create({data:{schoolId,userId:actorId,action:"UPDATE",
        entityType:"INTERNAL_MOCK",entityId:sessionId,newValues:{status:"OPEN"}}});
      return {id:sessionId,status:"OPEN"};
    });
  }

  async sheet(schoolId:string,userId:string,role:string|undefined,paperId:string){
    const paper=await this.prisma.client.internalExamPaper.findFirst({
      where:{id:paperId,session:{schoolId}},
      select:{id:true,subjectId:true,nameSnapshot:true,codeSnapshot:true,maxMarks:true,finalizedAt:true,
        session:{select:{id:true,classId:true,name:true,status:true,
          candidates:{orderBy:{nameSnapshot:"asc"},
            select:{id:true,studentId:true,nameSnapshot:true,admissionNumberSnapshot:true,
              marks:{where:{paperId},select:{marks:true,status:true,version:true,updatedAt:true}}}}}},
      },
    });
    if(!paper)throw new NotFoundException("Mock subject paper not found.");
    await this.canRead(schoolId,userId,role,paper.session.classId,paper.subjectId);
    const canEdit=role==="teacher"&&!paper.finalizedAt&&paper.session.status==="OPEN"&&
      (await this.scope.getAssignments(schoolId,userId)).subjectAssignments.some(x=>
        x.classId===paper.session.classId&&x.subjectId===paper.subjectId);
    return {
      paper:{id:paper.id,name:paper.nameSnapshot,code:paper.codeSnapshot,
        maxMarks:Number(paper.maxMarks),finalizedAt:paper.finalizedAt},
      session:{id:paper.session.id,name:paper.session.name,status:paper.session.status},
      canEdit,
      candidates:paper.session.candidates.map(c=>{
        const m=c.marks[0];
        return {id:c.id,studentId:c.studentId,name:c.nameSnapshot,
          admissionNumber:c.admissionNumberSnapshot,marks:m?.marks==null?null:Number(m.marks),
          status:m?.status??null,version:m?.version??0,
          percentage:mockPercent(m?.marks==null?null:Number(m.marks),Number(paper.maxMarks))};
      }),
    };
  }

  async save(schoolId:string,actorId:string,role:string|undefined,input:z.infer<typeof mockMarkSchema>){
    const paper=await this.prisma.client.internalExamPaper.findFirst({
      where:{id:input.paperId,session:{schoolId}},
      select:{id:true,maxMarks:true,subjectId:true,finalizedAt:true,
        session:{select:{id:true,classId:true,status:true}}},
    });
    if(!paper)throw new NotFoundException("Mock paper not found.");
    await this.canWrite(schoolId,actorId,role,paper.session.classId,paper.subjectId);
    try{validateMockMarks(Number(paper.maxMarks),input.entries);}
    catch(e){throw new BadRequestException((e as Error).message);}
    if(paper.session.status!=="OPEN"||paper.finalizedAt){
      throw new ConflictException("This mock subject paper is locked.");
    }
    return this.prisma.client.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}),hashtext(${paper.session.id}))`;
      const current=await tx.internalExamPaper.findFirst({
        where:{id:paper.id,session:{schoolId,status:"OPEN"}},
        select:{finalizedAt:true},
      });
      if(!current||current.finalizedAt)throw new ConflictException("Mock paper is no longer open.");
      const candidates=await tx.internalExamCandidate.findMany({
        where:{sessionId:paper.session.id,id:{in:input.entries.map(e=>e.candidateId)}},
        select:{id:true},
      });
      if(candidates.length!==input.entries.length){
        throw new BadRequestException("A selected candidate is not registered for this mock.");
      }
      for(const row of input.entries){
        const before=await tx.internalExamMark.findUnique({
          where:{candidateId_paperId:{candidateId:row.candidateId,paperId:paper.id}},
          select:{id:true,version:true,marks:true,status:true},
        });
        if((before?.version??0)!==row.expectedVersion){
          throw new ConflictException("Mock marks changed since this sheet was opened. Refresh before saving.");
        }
        const newValue=row.status==="ABSENT"?null:new Prisma.Decimal(row.marks!);
        if(before){
          await tx.internalExamMark.update({
            where:{id:before.id},data:{marks:newValue,status:row.status,
              version:{increment:1},recordedById:actorId},
          });
        } else {
          await tx.internalExamMark.create({data:{
            candidateId:row.candidateId,paperId:paper.id,marks:newValue,
            status:row.status,recordedById:actorId,
          }});
        }
        await tx.auditLog.create({data:{
          schoolId,userId:actorId,action:before?"UPDATE":"CREATE",
          entityType:"INTERNAL_MOCK_MARK",entityId:before?.id??row.candidateId+"|"+paper.id,
          oldValues:before?{status:before.status,marks:before.marks==null?null:String(before.marks),
            version:before.version}:Prisma.DbNull,
          newValues:{paperId:paper.id,candidateId:row.candidateId,status:row.status,
            marks:row.marks,version:(before?.version??0)+1},
        }});
      }
      return {saved:input.entries.length,paperId:paper.id};
    });
  }

  async finalizePaper(schoolId:string,actorId:string,role:string|undefined,paperId:string){
    const paper=await this.prisma.client.internalExamPaper.findFirst({
      where:{id:paperId,session:{schoolId}},
      select:{id:true,subjectId:true,session:{select:{id:true,classId:true,status:true}}},
    });
    if(!paper)throw new NotFoundException("Mock paper not found.");
    await this.canWrite(schoolId,actorId,role,paper.session.classId,paper.subjectId);
    return this.prisma.client.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}),hashtext(${paper.session.id}))`;
      const row=await tx.internalExamPaper.findFirst({
        where:{id:paper.id,session:{schoolId,status:"OPEN"}},
        select:{finalizedAt:true},
      });
      if(!row||row.finalizedAt)throw new ConflictException("The mock paper is already locked.");
      const [expected,marked]=await Promise.all([
        tx.internalExamCandidate.count({where:{sessionId:paper.session.id}}),
        tx.internalExamMark.count({where:{paperId:paper.id}}),
      ]);
      if(!expected||marked!==expected)throw new ConflictException(
        "Every registered pupil must be marked or explicitly marked absent before finalisation.");
      await tx.internalExamPaper.update({where:{id:paper.id},data:{finalizedAt:new Date()}});
      await tx.auditLog.create({data:{schoolId,userId:actorId,action:"UPDATE",
        entityType:"INTERNAL_MOCK_PAPER",entityId:paper.id,
        newValues:{operation:"FINALIZE",candidateCount:expected}}});
      return {id:paper.id,finalized:true};
    });
  }

  async lock(schoolId:string,actorId:string,role:string|undefined,sessionId:string){
    if(!isSchoolManager(role))throw new ForbiddenException();
    return this.prisma.client.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}),hashtext(${sessionId}))`;
      const session=await tx.internalExamSession.findFirst({
        where:{id:sessionId,schoolId,status:"OPEN"},
        select:{id:true,papers:{select:{finalizedAt:true}}},
      });
      if(!session)throw new ConflictException("Only an open mock may be locked.");
      if(!session.papers.length||session.papers.some(x=>!x.finalizedAt)){
        throw new ConflictException("All subject papers must be finalised before locking the mock.");
      }
      await tx.internalExamSession.update({where:{id:sessionId},data:{status:"LOCKED",lockedAt:new Date()}});
      await tx.auditLog.create({data:{schoolId,userId:actorId,action:"UPDATE",
        entityType:"INTERNAL_MOCK",entityId:sessionId,newValues:{status:"LOCKED"}}});
      return {id:sessionId,status:"LOCKED"};
    });
  }
}
