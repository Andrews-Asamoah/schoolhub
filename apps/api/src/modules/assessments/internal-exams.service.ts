import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { PrismaService } from "../../prisma/prisma.service.js";
import { TeacherScopeService } from "../../common/scope/teacher-scope.service.js";
import { isSchoolManager } from "../../common/scope/teacher-access.js";
import { mockPercent,validateMockMarks } from "./internal-exams.js";
import type { mockMarkSchema, mockSectionMarkSchema } from "./internal-exams.schemas.js";

@Injectable()
export class InternalExamsService {
  constructor(private readonly prisma: PrismaService,private readonly scope: TeacherScopeService){}

  private async canRead(
    schoolId:string,userId:string,role:string|undefined,classId:string,subjectId?:string,sectionTeacherIds:string[]=[],
  ) {
    if(isSchoolManager(role)) return;
    if(role!=="teacher") throw new ForbiddenException("Only authorised school staff may use internal examinations.");
    const a=await this.scope.getAssignments(schoolId,userId);
    const eligible=subjectId
      ? a.subjectAssignments.some(s=>s.classId===classId&&s.subjectId===subjectId) ||
        a.subjectStrandAssignments.some(s=>s.classId===classId&&s.subjectId===subjectId) ||
        (a.teacherId !== null && sectionTeacherIds.includes(a.teacherId)) ||
        a.classTeacherClassIds.includes(classId)
      : a.classTeacherClassIds.includes(classId) ||
        a.subjectAssignments.some(s=>s.classId===classId) ||
        a.subjectStrandAssignments.some(s=>s.classId===classId);
    if(!eligible)throw new ForbiddenException("You do not teach this class or subject.");
  }

  private async canWrite(schoolId:string,userId:string,role:string|undefined,classId:string,subjectId:string) {
    if(role!=="teacher")throw new ForbiddenException("Only the assigned subject teacher may enter mock marks.");
    const a=await this.scope.getAssignments(schoolId,userId);
    const eligible=a.subjectAssignments.some(s=>s.classId===classId&&s.subjectId===subjectId) ||
      a.subjectStrandAssignments.some(s=>s.classId===classId&&s.subjectId===subjectId);
    if(!eligible)throw new ForbiddenException("You are not assigned to this class and subject.");
  }

  async list(schoolId:string,userId:string,role:string|undefined){
    const assignments=role==="teacher" ? await this.scope.getAssignments(schoolId,userId):null;
    if(!isSchoolManager(role)&&role!=="teacher")throw new ForbiddenException();
    const classes=assignments? [...new Set([
      ...assignments.classTeacherClassIds,
      ...assignments.subjectAssignments.map(x=>x.classId),
      ...assignments.subjectStrandAssignments.map(x=>x.classId),
    ])]:null;
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
          maxMarks:true,finalizedAt:true,sections:{select:{id:true,nameSnapshot:true,weightPercent:true}}}},
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
          subjects:{
            where:{subject:{isActive:true,deletedAt:null}},
            select:{
              subject:{select:{id:true,name:true,code:true,strands:{
                where:{isActive:true},orderBy:[{sortOrder:"asc"},{name:"asc"}],
                select:{id:true,name:true,code:true,examWeightPercent:true},
              }}},
              strandAssignments:{where:{subjectStrand:{isActive:true},},select:{subjectStrandId:true,teacherId:true}},
            },
          }},
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
    for (const offering of classroom.subjects) {
      const strands=offering.subject.strands;
      if (!strands.length) continue;
      const totalWeight=strands.reduce((sum,strand)=>sum+Number(strand.examWeightPercent),0);
      if (Math.abs(totalWeight-100)>0.01) {
        throw new BadRequestException(`Configure examination contributions totalling 100% for ${offering.subject.name} before creating a mock.`);
      }
      const assignedIds=new Set(offering.strandAssignments.map(row=>row.subjectStrandId));
      if (strands.some(strand=>!assignedIds.has(strand.id))) {
        throw new BadRequestException(`Assign a teacher to every ${offering.subject.name} teaching area in this class before creating a mock.`);
      }
    }
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
            ...(x.subject.strands.length ? {
              sections:{create:x.subject.strands.map(strand=>({
                subjectStrandId:strand.id,
                teacherId:x.strandAssignments.find(row=>row.subjectStrandId===strand.id)!.teacherId,
                nameSnapshot:strand.name,
                codeSnapshot:strand.code,
                maxMarks:new Prisma.Decimal(100),
                weightPercent:strand.examWeightPercent,
              }))},
            } : {}),
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
      select:{
        id:true,subjectId:true,nameSnapshot:true,codeSnapshot:true,maxMarks:true,finalizedAt:true,
        sections:{
          orderBy:{subjectStrand:{sortOrder:"asc"}},
          select:{id:true,subjectStrandId:true,teacherId:true,nameSnapshot:true,codeSnapshot:true,maxMarks:true,weightPercent:true},
        },
        session:{select:{id:true,classId:true,name:true,status:true,
          candidates:{orderBy:{nameSnapshot:"asc"},
            select:{
              id:true,studentId:true,nameSnapshot:true,admissionNumberSnapshot:true,
              marks:{where:{paperId},select:{marks:true,status:true,version:true,updatedAt:true}},
              sectionMarks:{where:{paperSection:{paperId}},select:{paperSectionId:true,marks:true,status:true,version:true,updatedAt:true}},
            },
          },
        }},
      },
    });
    if(!paper)throw new NotFoundException("Mock subject paper not found.");
    const assignments=role==="teacher"?await this.scope.getAssignments(schoolId,userId):null;
    const sectionTeacherIds=paper.sections.flatMap(section=>section.teacherId?[section.teacherId]:[]);
    await this.canRead(schoolId,userId,role,paper.session.classId,paper.subjectId,sectionTeacherIds);
    const editablePaper=!paper.finalizedAt&&paper.session.status==="OPEN";
    const sections=paper.sections.map(section=>({
      id:section.id,
      subjectStrandId:section.subjectStrandId,
      name:section.nameSnapshot,
      code:section.codeSnapshot,
      maxMarks:Number(section.maxMarks),
      weightPercent:Number(section.weightPercent),
      canEdit:Boolean(editablePaper&&role==="teacher"&&assignments?.teacherId&&section.teacherId===assignments.teacherId),
    }));
    const legacyCanEdit=Boolean(editablePaper&&role==="teacher"&&assignments?.subjectAssignments.some(x=>
      x.classId===paper.session.classId&&x.subjectId===paper.subjectId));
    return {
      paper:{id:paper.id,name:paper.nameSnapshot,code:paper.codeSnapshot,
        maxMarks:Number(paper.maxMarks),finalizedAt:paper.finalizedAt,sections},
      session:{id:paper.session.id,name:paper.session.name,status:paper.session.status},
      canEdit:sections.length?sections.some(section=>section.canEdit):legacyCanEdit,
      candidates:paper.session.candidates.map(c=>{
        const m=c.marks[0];
        return {
          id:c.id,studentId:c.studentId,name:c.nameSnapshot,admissionNumber:c.admissionNumberSnapshot,
          marks:m?.marks==null?null:Number(m.marks),status:m?.status??null,version:m?.version??0,
          percentage:mockPercent(m?.marks==null?null:Number(m.marks),Number(paper.maxMarks)),
          sectionMarks:c.sectionMarks.map(mark=>({
            sectionId:mark.paperSectionId,
            marks:mark.marks==null?null:Number(mark.marks),
            status:mark.status,
            version:mark.version,
          })),
        };
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
    if (role !== "teacher" || !(await this.scope.getAssignments(schoolId,actorId)).subjectAssignments.some(
      assignment=>assignment.classId===paper.session.classId&&assignment.subjectId===paper.subjectId,
    )) {
      throw new ForbiddenException("Only the assigned whole-subject teacher may enter marks on a legacy single-mark paper.");
    }
    const hasSections=await this.prisma.client.internalExamPaperSection.count({where:{paperId:paper.id}});
    if(hasSections)throw new BadRequestException("This combined subject paper is marked by teaching-area sections. Save marks through the relevant section.");
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

  /** Saves one strand's candidate marks and recomputes the single parent subject mark when every section is complete. */
  async saveSectionMarks(
    schoolId:string,
    actorId:string,
    role:string|undefined,
    input:z.infer<typeof mockSectionMarkSchema>,
  ){
    if(role!=="teacher")throw new ForbiddenException("Only the assigned teaching-area teacher may enter section marks.");
    const section=await this.prisma.client.internalExamPaperSection.findFirst({
      where:{id:input.sectionId,paper:{session:{schoolId}}},
      select:{
        id:true,paperId:true,teacherId:true,maxMarks:true,
        paper:{select:{
          subjectId:true,maxMarks:true,finalizedAt:true,
          session:{select:{id:true,classId:true,status:true}},
        }},
      },
    });
    if(!section)throw new NotFoundException("Mock examination section not found.");
    const assignments=await this.scope.getAssignments(schoolId,actorId);
    if(!assignments.teacherId||!section.teacherId||assignments.teacherId!==section.teacherId){
      throw new ForbiddenException("You are not the teacher assigned to this examination section.");
    }
    try{validateMockMarks(Number(section.maxMarks),input.entries);}
    catch(error){throw new BadRequestException((error as Error).message);}
    if(section.paper.session.status!=="OPEN"||section.paper.finalizedAt){
      throw new ConflictException("This mock subject paper is locked.");
    }

    return this.prisma.client.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}),hashtext(${section.paper.session.id}))`;
      const current=await tx.internalExamPaperSection.findFirst({
        where:{id:section.id,paper:{session:{schoolId,status:"OPEN"},finalizedAt:null}},
        select:{id:true,paperId:true,teacherId:true,maxMarks:true,
          paper:{select:{id:true,maxMarks:true,finalizedAt:true}}},
      });
      if(!current||current.finalizedAt||current.paper.finalizedAt||current.teacherId!==assignments.teacherId){
        throw new ConflictException("This examination section is no longer open for your account.");
      }
      const candidates=await tx.internalExamCandidate.findMany({
        where:{sessionId:section.paper.session.id,id:{in:input.entries.map(entry=>entry.candidateId)}},
        select:{id:true},
      });
      if(candidates.length!==input.entries.length){
        throw new BadRequestException("A selected candidate is not registered for this mock.");
      }

      for(const entry of input.entries){
        const before=await tx.internalExamSectionMark.findUnique({
          where:{candidateId_paperSectionId:{candidateId:entry.candidateId,paperSectionId:section.id}},
          select:{id:true,version:true,marks:true,status:true},
        });
        if((before?.version??0)!==entry.expectedVersion){
          throw new ConflictException("Section marks changed since this sheet was opened. Refresh before saving.");
        }
        const value=entry.status==="ABSENT"?null:new Prisma.Decimal(entry.marks!);
        if(before){
          await tx.internalExamSectionMark.update({
            where:{id:before.id},
            data:{marks:value,status:entry.status,version:{increment:1},recordedById:actorId},
          });
        }else{
          await tx.internalExamSectionMark.create({data:{
            candidateId:entry.candidateId,paperSectionId:section.id,
            marks:value,status:entry.status,recordedById:actorId,
          }});
        }
        await tx.auditLog.create({data:{
          schoolId,userId:actorId,action:before?"UPDATE":"CREATE",
          entityType:"INTERNAL_MOCK_SECTION_MARK",
          entityId:before?.id??entry.candidateId+"|"+section.id,
          oldValues:before?{status:before.status,marks:before.marks==null?null:String(before.marks),version:before.version}:Prisma.DbNull,
          newValues:{sectionId:section.id,candidateId:entry.candidateId,status:entry.status,
            marks:entry.marks,version:(before?.version??0)+1},
        }});
      }

      const sections=await tx.internalExamPaperSection.findMany({
        where:{paperId:section.paperId},
        select:{id:true,maxMarks:true,weightPercent:true},
      });
      const totalWeight=sections.reduce((sum,row)=>sum+Number(row.weightPercent),0);
      if(!sections.length||Math.abs(totalWeight-100)>0.01){
        throw new ConflictException("The examination paper has an invalid teaching-area weighting configuration.");
      }
      let aggregatesCompleted=0;
      for(const entry of input.entries){
        const sectionMarks=await tx.internalExamSectionMark.findMany({
          where:{candidateId:entry.candidateId,paperSectionId:{in:sections.map(row=>row.id)}},
          select:{paperSectionId:true,marks:true,status:true,paperSection:{select:{maxMarks:true,weightPercent:true}}},
        });
        if(sectionMarks.length!==sections.length)continue;
        const anyAbsent=sectionMarks.some(mark=>mark.status==="ABSENT");
        let aggregate:Prisma.Decimal|null=null;
        let status:"MARKED"|"ABSENT"="ABSENT";
        if(!anyAbsent){
          const weightedPercent=sectionMarks.reduce((sum,mark)=>{
            if(mark.marks===null)throw new ConflictException("A recorded section is missing its marks.");
            const sectionMaximum=Number(mark.paperSection.maxMarks);
            if(sectionMaximum<=0)throw new ConflictException("A section has an invalid maximum mark.");
            return sum+(Number(mark.marks)/sectionMaximum)*Number(mark.paperSection.weightPercent);
          },0);
          const rounded=Math.round((weightedPercent/100)*Number(section.paper.maxMarks)*100)/100;
          aggregate=new Prisma.Decimal(rounded);
          status="MARKED";
        }
        const previous=await tx.internalExamMark.findUnique({
          where:{candidateId_paperId:{candidateId:entry.candidateId,paperId:section.paperId}},
          select:{id:true},
        });
        if(previous){
          await tx.internalExamMark.update({
            where:{id:previous.id},
            data:{marks:aggregate,status,version:{increment:1},recordedById:actorId},
          });
        }else{
          await tx.internalExamMark.create({data:{
            candidateId:entry.candidateId,paperId:section.paperId,
            marks:aggregate,status,recordedById:actorId,
          }});
        }
        aggregatesCompleted++;
      }
      return {saved:input.entries.length,sectionId:section.id,paperId:section.paperId,aggregatesUpdated:aggregatesCompleted};
    },{timeout:30000});
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
