import { BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";
import { TeacherScopeService } from "../../common/scope/teacher-scope.service.js";
import { isSchoolManager } from "../../common/scope/teacher-access.js";
import { competitionRanks,gradeForPercentage,mockSnapshotPdf,validateBands,snapshotHash,
  type GradeBand,type MockPaperResult,type MockSnapshot } from "./mock-report.js";

const evidence=(value:string)=>value.trim().length>=10&&value.trim().length<=2000;
const asJson=(snapshot:MockSnapshot)=>snapshot as unknown as Prisma.InputJsonValue;
const number=(d:Prisma.Decimal)=>Number(d);
@Injectable()
export class MockReportService {
  constructor(private readonly prisma:PrismaService,private readonly scope:TeacherScopeService){}

  private async canReview(schoolId:string,userId:string,role:string|undefined,classId:string){
    if(isSchoolManager(role))return;
    if(role!=="teacher")throw new ForbiddenException("Restricted school examination reports.");
    const assigned=await this.scope.getAssignments(schoolId,userId);
    if(!assigned.classTeacherClassIds.includes(classId)){
      throw new ForbiddenException("Only the assigned class teacher may review these reports.");
    }
  }
  private async classTeacher(schoolId:string,userId:string,classId:string){
    const assigned=await this.scope.getAssignments(schoolId,userId);
    if(!assigned.teacherId||!assigned.classTeacherClassIds.includes(classId)){
      throw new ForbiddenException("Only the appointed class teacher may recommend this pupil.");
    }
  }
  private async actor(userId:string){
    const actor=await this.prisma.client.user.findUnique({where:{id:userId},
      select:{id:true,name:true}});
    if(!actor)throw new ForbiddenException("Approving staff account not found.");
    return actor;
  }

  async gradingSystems(schoolId:string,role:string|undefined){
    if(!isSchoolManager(role))throw new ForbiddenException();
    const systems=await this.prisma.client.gradingSystem.findMany({
      where:{isActive:true,OR:[{schoolId},{schoolId:null,isSystemDefault:true}]},
      include:{gradeScales:{orderBy:{displayOrder:"asc"}}},
      orderBy:{name:"asc"},
    });
    return systems.map(s=>({id:s.id,name:s.name,isSchoolDefault:s.isSchoolDefault,
      isSystemDefault:s.isSystemDefault,gradeScales:s.gradeScales.map(g=>({
        grade:g.grade,min:number(g.minScore),max:number(g.maxScore),description:g.description,
      }))}));
  }

  /** Freeze the results and the exact grading policy, never recalculate on download. */
  async generate(schoolId:string,userId:string,role:string|undefined,
    sessionId:string,gradingSystemId:string){
    if(!isSchoolManager(role))throw new ForbiddenException();
    const actor=await this.actor(userId);
    return this.prisma.client.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}),hashtext(${sessionId}))`;
      const session=await tx.internalExamSession.findFirst({
        where:{id:sessionId,schoolId,status:"LOCKED"},
        include:{
          school:{select:{name:true,code:true}},
          academicYear:{select:{name:true}},
          term:{select:{name:true}},
          class:{select:{name:true}},
          papers:{orderBy:{codeSnapshot:"asc"},
            select:{id:true,nameSnapshot:true,codeSnapshot:true,maxMarks:true,finalizedAt:true}},
          candidates:{orderBy:{nameSnapshot:"asc"},include:{
            marks:{select:{paperId:true,status:true,marks:true}},
          }},
        },
      });
      if(!session)throw new ConflictException("Lock all mock papers before generating results.");
      if(!session.candidates.length||!session.papers.length||session.papers.some(p=>!p.finalizedAt)){
        throw new ConflictException("Mock roster and all subject papers must be finalised.");
      }
      const already=await tx.internalMockReport.count({where:{schoolId,sessionId}});
      if(already)throw new ConflictException("Reports already generated. Corrections require a controlled new version.");
      const gradeSystem=await tx.gradingSystem.findFirst({
        where:{id:gradingSystemId,isActive:true,
          OR:[{schoolId},{schoolId:null,isSystemDefault:true}]},
        include:{gradeScales:{orderBy:{displayOrder:"asc"}}},
      });
      if(!gradeSystem)throw new BadRequestException("Select a valid school or system grading policy.");
      const bands:GradeBand[]=gradeSystem.gradeScales.map(b=>({
        grade:b.grade,min:Number(b.minScore),max:Number(b.maxScore),description:b.description,
      }));
      try{validateBands(bands);}catch(e){throw new BadRequestException((e as Error).message);}
      const completed=session.candidates.map(candidate=>{
        const byPaper=new Map(candidate.marks.map(mark=>[mark.paperId,mark]));
        if(candidate.marks.length!==session.papers.length||session.papers.some(p=>!byPaper.has(p.id))){
          throw new ConflictException("All candidates require a recorded mark or explicit absence in every paper.");
        }
        let absent=false,total=0,maximum=0;
        const papers:MockPaperResult[]=session.papers.map(p=>{
          const entry=byPaper.get(p.id)!;
          const maxMarks=Number(p.maxMarks);
          if(entry.status==="ABSENT"){
            if(entry.marks!==null)throw new ConflictException("Absent pupil has an invalid numerical score.");
            absent=true;
            return {id:p.id,name:p.nameSnapshot,code:p.codeSnapshot,maxMarks,
              mark:null,status:"ABSENT",percentage:null,grade:null};
          }
          if(entry.marks===null)throw new ConflictException("Recorded mock paper has no mark.");
          const mark=Number(entry.marks);
          if(mark<0||mark>maxMarks)throw new ConflictException("Mock mark outside its paper maximum.");
          const percentage=Math.round(mark/maxMarks*10000)/100;
          total+=mark;maximum+=maxMarks;
          return {id:p.id,name:p.nameSnapshot,code:p.codeSnapshot,maxMarks,
            mark,status:"MARKED",percentage,grade:gradeForPercentage(percentage,bands)};
        });
        return {candidate,papers,average:absent?null:Math.round(total/maximum*10000)/100};
      });
      const ranks=competitionRanks(completed.map(c=>({id:c.candidate.id,average:c.average})));
      const capturedAt=new Date().toISOString();
      for(const row of completed){
        const snap:MockSnapshot={
          schemaVersion:1,kind:"INTERNAL_MOCK",name:session.name,number:session.mockNumber,
          school:session.school,year:session.academicYear.name,term:session.term.name,
          className:session.class.name,
          pupil:{name:row.candidate.nameSnapshot,
            admissionNumber:row.candidate.admissionNumberSnapshot},
          papers:row.papers,
          grading:{name:gradeSystem.name,bands,scoreRounding:"NEAREST_WHOLE_PERCENT"},
          average:row.average,position:ranks.get(row.candidate.id)??null,
          positionMethod:"COMPETITION",capturedAt,
        };
        await tx.internalMockReport.create({data:{
          schoolId,sessionId,candidateId:row.candidate.id,studentId:row.candidate.studentId,
          snapshot:asJson(snap),snapshotHash:snapshotHash(snap),version:1,
        }});
      }
      await tx.auditLog.create({data:{schoolId,userId:actor.id,action:"CREATE",
        entityType:"INTERNAL_MOCK_REPORT_BATCH",entityId:sessionId,
        newValues:{count:completed.length,gradingSystemId,
          gradeBands:bands.map(b=>({grade:b.grade,min:b.min,max:b.max,description:b.description})),
          capturedAt,positionMethod:"COMPETITION"}}});
      return {sessionId,generated:completed.length,gradingSystem:gradeSystem.name};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
  }

  async review(schoolId:string,userId:string,role:string|undefined,sessionId:string){
    const session=await this.prisma.client.internalExamSession.findFirst({
      where:{id:sessionId,schoolId},select:{id:true,classId:true,name:true,status:true,
        candidates:{select:{id:true}},papers:{select:{id:true}} },
    });
    if(!session)throw new NotFoundException("Mock examination not found.");
    await this.canReview(schoolId,userId,role,session.classId);
    const rows=await this.prisma.client.internalMockReport.findMany({
      where:{schoolId,sessionId},orderBy:{createdAt:"asc"},
      select:{id:true,candidateId:true,studentId:true,version:true,stage:true,
        snapshot:true,snapshotHash:true,teacherRemark:true,teacherName:true,
        teacherApprovedAt:true,headRemark:true,headName:true,headApprovedAt:true,
        publishedAt:true},
    });
    return {session:{id:session.id,name:session.name,status:session.status},
      expected:session.candidates.length,generated:rows.length,
      papers:session.papers.length,
      reports:rows.map(r=>({...r,integrityOk:snapshotHash(r.snapshot)===r.snapshotHash}))};
  }

  async recommend(schoolId:string,actorId:string,role:string|undefined,reportId:string,remark:string){
    if(role!=="teacher")throw new ForbiddenException("Class-teacher role is required.");
    if(!evidence(remark))throw new BadRequestException("Write 10–2000 characters of recommendation.");
    const report=await this.prisma.client.internalMockReport.findFirst({
      where:{id:reportId,schoolId},
      select:{id:true,sessionId:true,session:{select:{classId:true}}},
    });
    if(!report)throw new NotFoundException("Mock report not found.");
    await this.classTeacher(schoolId,actorId,report.session.classId);
    const actor=await this.actor(actorId);
    return this.prisma.client.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}),hashtext(${report.sessionId}))`;
      const current=await tx.internalMockReport.findFirst({
        where:{id:reportId,schoolId,stage:"GENERATED"},select:{id:true,snapshot:true,snapshotHash:true},
      });
      if(!current)throw new ConflictException("Mock report has already been reviewed or released.");
      if(snapshotHash(current.snapshot)!==current.snapshotHash)throw new ConflictException("Mock source integrity check failed.");
      await tx.internalMockReport.update({where:{id:reportId},data:{
        stage:"TEACHER_REVIEWED",teacherActorId:actor.id,teacherName:actor.name.slice(0,160),
        teacherRemark:remark.trim(),teacherApprovedAt:new Date(),
      }});
      await tx.auditLog.create({data:{schoolId,userId:actorId,action:"UPDATE",
        entityType:"INTERNAL_MOCK_REPORT",entityId:reportId,
        newValues:{stage:"TEACHER_REVIEWED",snapshotHash:current.snapshotHash,remark:remark.trim()}}});
      return {id:reportId,stage:"TEACHER_REVIEWED"};
    });
  }

  async headApprove(schoolId:string,actorId:string,role:string|undefined,reportId:string,remark:string){
    if(role!=="headteacher")throw new ForbiddenException("Headteacher role is required.");
    if(!evidence(remark))throw new BadRequestException("Write 10–2000 characters of recommendation.");
    const actor=await this.actor(actorId);
    const report=await this.prisma.client.internalMockReport.findFirst({
      where:{id:reportId,schoolId},select:{sessionId:true},
    });
    if(!report)throw new NotFoundException("Mock report not found.");
    return this.prisma.client.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}),hashtext(${report.sessionId}))`;
      const row=await tx.internalMockReport.findFirst({
        where:{id:reportId,schoolId,stage:"TEACHER_REVIEWED"},
        select:{teacherActorId:true,teacherApprovedAt:true,snapshot:true,snapshotHash:true},
      });
      if(!row||!row.teacherActorId||!row.teacherApprovedAt){
        throw new ConflictException("Class-teacher recommendation is required first.");
      }
      if(row.teacherActorId===actorId){
        throw new ForbiddenException("One person cannot sign both approval stages.");
      }
      if(snapshotHash(row.snapshot)!==row.snapshotHash)throw new ConflictException("Mock source integrity check failed.");
      await tx.internalMockReport.update({where:{id:reportId},data:{
        stage:"APPROVED",headActorId:actor.id,headName:actor.name.slice(0,160),
        headRemark:remark.trim(),headApprovedAt:new Date(),
      }});
      await tx.auditLog.create({data:{schoolId,userId:actorId,action:"UPDATE",
        entityType:"INTERNAL_MOCK_REPORT",entityId:reportId,
        newValues:{stage:"APPROVED",snapshotHash:row.snapshotHash,remark:remark.trim()}}});
      return {id:reportId,stage:"APPROVED"};
    });
  }

  async publish(schoolId:string,userId:string,role:string|undefined,sessionId:string){
    if(!isSchoolManager(role))throw new ForbiddenException();
    return this.prisma.client.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}),hashtext(${sessionId}))`;
      const session=await tx.internalExamSession.findFirst({
        where:{id:sessionId,schoolId,status:"LOCKED"},
        select:{id:true,candidates:{select:{id:true}}},
      });
      if(!session)throw new ConflictException("The entire mock examination must be locked before publication.");
      const rows=await tx.internalMockReport.findMany({
        where:{schoolId,sessionId},select:{id:true,candidateId:true,stage:true,
          teacherActorId:true,headActorId:true,teacherApprovedAt:true,headApprovedAt:true,
          teacherName:true,headName:true,snapshot:true,snapshotHash:true},
      });
      if(!rows.length||rows.length!==session.candidates.length||
        new Set(rows.map(r=>r.candidateId)).size!==rows.length||
        rows.some(r=>r.stage!=="APPROVED"||!r.teacherActorId||!r.headActorId||
        r.teacherActorId===r.headActorId||!r.teacherApprovedAt||!r.headApprovedAt||
        !r.teacherName||!r.headName||snapshotHash(r.snapshot)!==r.snapshotHash)){
        throw new ConflictException("Every pupil requires a verified class-teacher and distinct headteacher approval.");
      }
      const now=new Date();
      await tx.internalMockReport.updateMany({where:{schoolId,sessionId,stage:"APPROVED"},
        data:{stage:"PUBLISHED",publishedAt:now}});
      await tx.auditLog.create({data:{schoolId,userId,action:"UPDATE",
        entityType:"INTERNAL_MOCK_REPORT_BATCH",entityId:sessionId,
        newValues:{stage:"PUBLISHED",count:rows.length,at:now.toISOString()}}});
      return {sessionId,published:rows.length,publishedAt:now};
    });
  }

  async published(schoolId:string,userId:string,audience:"student"|"guardian"){
    const db=this.prisma.client;
    if(audience==="student"){
      const student=await db.student.findFirst({where:{schoolId,deletedAt:null,profile:{userId}},
        select:{id:true}});
      if(!student)return [];
      return db.internalMockReport.findMany({
        where:{schoolId,studentId:student.id,stage:"PUBLISHED",publishedAt:{not:null}},
        orderBy:{publishedAt:"desc"},select:{id:true,snapshot:true,publishedAt:true,version:true},
      });
    }
    const guardian=await db.guardian.findFirst({
      where:{schoolId,deletedAt:null,isActive:true,profile:{userId}},
      select:{students:{where:{receiveReports:true,student:{schoolId,deletedAt:null}},
        select:{studentId:true}}},
    });
    if(!guardian)return [];
    return db.internalMockReport.findMany({
      where:{schoolId,studentId:{in:guardian.students.map(x=>x.studentId)},
        stage:"PUBLISHED",publishedAt:{not:null}},
      orderBy:{publishedAt:"desc"},
      select:{id:true,snapshot:true,publishedAt:true,version:true},
    });
  }

  async pdf(schoolId:string,userId:string,reportId:string,audience:"student"|"guardian"){
    const report=await this.prisma.client.internalMockReport.findFirst({
      where:{id:reportId,schoolId,stage:"PUBLISHED",publishedAt:{not:null}},
    });
    if(!report)throw new NotFoundException("Published mock report not found.");
    const valid=audience==="student"
      ?await this.prisma.client.student.findFirst({
        where:{id:report.studentId,schoolId,deletedAt:null,profile:{userId}},select:{id:true}})
      :await this.prisma.client.guardian.findFirst({
        where:{schoolId,deletedAt:null,isActive:true,profile:{userId},
          students:{some:{studentId:report.studentId,receiveReports:true,
            student:{schoolId,deletedAt:null}}}},select:{id:true},
      });
    if(!valid)throw new NotFoundException("Published mock report not found.");
    if(snapshotHash(report.snapshot)!==report.snapshotHash||!report.publishedAt||
      !report.teacherName||!report.teacherRemark||!report.teacherApprovedAt||
      !report.headName||!report.headRemark||!report.headApprovedAt||
      !report.teacherActorId||!report.headActorId||report.teacherActorId===report.headActorId){
      throw new ConflictException("Mock report approval or integrity verification failed.");
    }
    const snapshot=report.snapshot as unknown as MockSnapshot;
    if(snapshot.kind!=="INTERNAL_MOCK")throw new ConflictException("Unexpected report category.");
    return {name:"school-mock-report-v"+report.version+".pdf",
      content:mockSnapshotPdf(snapshot,{
        hash:report.snapshotHash,version:report.version,
        teacherName:report.teacherName,teacherRemark:report.teacherRemark,teacherAt:report.teacherApprovedAt,
        headName:report.headName,headRemark:report.headRemark,headAt:report.headApprovedAt,
        publishedAt:report.publishedAt,
      })};
  }
}
