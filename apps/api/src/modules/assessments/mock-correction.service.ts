import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from "@nestjs/common";
import {Prisma} from "@prisma/client";
import {PrismaService} from "../../prisma/prisma.service.js";
import {TeacherScopeService} from "../../common/scope/teacher-scope.service.js";
import {isSchoolManager} from "../../common/scope/teacher-access.js";
import {snapshotHash,type MockSnapshot} from "./mock-report.js";
import {reviseMockCohort,type MockRevisionRow} from "./mock-correction.js";
import {validateMockMarks} from "./internal-exams.js";

type Proposed={candidateId:string;paperId:string;status:"MARKED"|"ABSENT";
  marks:number|null;expectedVersion:number;reason:string};
const reasonOk=(value:string)=>value.trim().length>=10&&value.trim().length<=2000;

@Injectable()
export class MockCorrectionService {
  constructor(private readonly prisma:PrismaService,private readonly scope:TeacherScopeService){}

  private async allowRequester(schoolId:string,actorId:string,role:string|undefined,
    classId:string,subjectId:string){
    if(isSchoolManager(role))return;
    if(role!=="teacher")throw new ForbiddenException("Only authorised staff may propose mock corrections.");
    const assignments=await this.scope.getAssignments(schoolId,actorId);
    if(!assignments.subjectAssignments.some(x=>x.classId===classId&&x.subjectId===subjectId)){
      throw new ForbiddenException("Only the assigned subject teacher may request correction of these marks.");
    }
  }

  async list(schoolId:string,actorId:string,role:string|undefined,sessionId:string){
    const session=await this.prisma.client.internalExamSession.findFirst({
      where:{id:sessionId,schoolId},select:{classId:true},
    });
    if(!session)throw new NotFoundException("Mock examination not found.");
    if(!isSchoolManager(role)){
      const assignment=await this.scope.getAssignments(schoolId,actorId);
      if(role!=="teacher"||!assignment.classTeacherClassIds.includes(session.classId)&&
        !assignment.subjectAssignments.some(s=>s.classId===session.classId)){
        throw new ForbiddenException("You cannot review this class's corrections.");
      }
    }
    return this.prisma.client.internalMockCorrection.findMany({
      where:{schoolId,sessionId},orderBy:{requestedAt:"desc"},take:100,
      select:{id:true,candidateId:true,paperId:true,baseVersion:true,
        previousStatus:true,previousMarks:true,requestedStatus:true,requestedMarks:true,
        reason:true,status:true,requestedAt:true,requestedById:true,
        reviewedAt:true,reviewReason:true,reviewedById:true,
        candidate:{select:{nameSnapshot:true}},paper:{select:{nameSnapshot:true}}},
    });
  }

  async request(schoolId:string,actorId:string,role:string|undefined,
    sessionId:string,proposed:Proposed){
    if(!reasonOk(proposed.reason))throw new BadRequestException("Give a correction reason of 10–2000 characters.");
    if(!Number.isInteger(proposed.expectedVersion)||proposed.expectedVersion<1){
      throw new BadRequestException("Provide the published report version being corrected.");
    }
    return this.prisma.client.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}),hashtext(${sessionId}))`;
      const session=await tx.internalExamSession.findFirst({
        where:{id:sessionId,schoolId,status:"LOCKED"},
        select:{id:true,classId:true,candidates:{select:{id:true}},
          papers:{select:{id:true,subjectId:true,maxMarks:true}}},
      });
      if(!session)throw new ConflictException("Only locked internal mock reports can be corrected.");
      const paper=session.papers.find(p=>p.id===proposed.paperId);
      if(!paper)throw new NotFoundException("Mock paper not found in this school.");
      await this.allowRequester(schoolId,actorId,role,session.classId,paper.subjectId);
      if(!session.candidates.some(c=>c.id===proposed.candidateId)){
        throw new NotFoundException("Pupil is not in this mock's frozen roster.");
      }
      try{validateMockMarks(Number(paper.maxMarks),[{status:proposed.status,marks:proposed.marks}]);}
      catch(e){throw new BadRequestException((e as Error).message);}
      const pending=await tx.internalMockCorrection.count({
        where:{schoolId,sessionId,status:"PENDING"},
      });
      if(pending)throw new ConflictException("Review the existing pending correction before submitting another.");
      const all=await tx.internalMockReport.findMany({
        where:{schoolId,sessionId},select:{candidateId:true,version:true,stage:true},
        orderBy:{version:"desc"},
      });
      const newest=new Map<string,typeof all[number]>();
      for(const item of all)if(!newest.has(item.candidateId))newest.set(item.candidateId,item);
      if(newest.size!==session.candidates.length||[...newest.values()].some(r=>r.stage!=="PUBLISHED")){
        throw new ConflictException("Complete and publish the current report batch before requesting a correction.");
      }
      const current=await tx.internalMockReport.findFirst({
        where:{schoolId,sessionId,candidateId:proposed.candidateId,stage:"PUBLISHED"},
        orderBy:{version:"desc"},
        select:{version:true,snapshot:true,snapshotHash:true},
      });
      if(!current||current.version!==proposed.expectedVersion){
        throw new ConflictException("Report version changed. Reload published results.");
      }
      if(snapshotHash(current.snapshot)!==current.snapshotHash){
        throw new ConflictException("Original report failed integrity verification.");
      }
      const snapshot=current.snapshot as unknown as MockSnapshot;
      const old=snapshot.papers.find(p=>p.id===proposed.paperId);
      if(!old)throw new ConflictException("Paper is missing in the frozen report.");
      if(old.status===proposed.status&&old.mark===proposed.marks){
        throw new BadRequestException("The proposed result is identical to the current published score.");
      }
      const created=await tx.internalMockCorrection.create({data:{
        schoolId,sessionId,candidateId:proposed.candidateId,paperId:proposed.paperId,
        baseVersion:current.version,previousStatus:old.status,
        previousMarks:old.mark===null?null:new Prisma.Decimal(old.mark),
        requestedStatus:proposed.status,
        requestedMarks:proposed.marks===null?null:new Prisma.Decimal(proposed.marks),
        requestedById:actorId,reason:proposed.reason.trim(),
      },select:{id:true,status:true}});
      await tx.auditLog.create({data:{schoolId,userId:actorId,action:"CREATE",
        entityType:"INTERNAL_MOCK_CORRECTION",entityId:created.id,
        newValues:{sessionId,candidateId:proposed.candidateId,paperId:proposed.paperId,
          before:{status:old.status,marks:old.mark},
          after:{status:proposed.status,marks:proposed.marks},
          reason:proposed.reason.trim(),baseVersion:current.version}}});
      return created;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
  }

  async decide(schoolId:string,actorId:string,role:string|undefined,
    id:string,approve:boolean,reviewReason:string){
    if(role!=="headteacher")throw new ForbiddenException("Only the headteacher can approve/reject a mock correction.");
    if(!reasonOk(reviewReason))throw new BadRequestException("Record a review reason of 10–2000 characters.");
    const request=await this.prisma.client.internalMockCorrection.findFirst({
      where:{id,schoolId},select:{sessionId:true},
    });
    if(!request)throw new NotFoundException("Correction request not found.");
    return this.prisma.client.$transaction(async tx=>{
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${schoolId}),hashtext(${request.sessionId}))`;
      const item=await tx.internalMockCorrection.findFirst({
        where:{id,schoolId,status:"PENDING"},
        select:{id:true,sessionId:true,candidateId:true,paperId:true,baseVersion:true,
          previousStatus:true,previousMarks:true,requestedStatus:true,requestedMarks:true,
          requestedById:true},
      });
      if(!item)throw new ConflictException("This correction has already been reviewed.");
      if(!item.requestedById||item.requestedById===actorId){
        throw new ForbiddenException("A different headteacher must review the request.");
      }
      const actor=await tx.user.findUnique({where:{id:actorId},select:{id:true}});
      if(!actor)throw new ForbiddenException("Reviewing staff account is unavailable.");
      const now=new Date();
      if(!approve){
        await tx.internalMockCorrection.update({where:{id},data:{status:"REJECTED",
          reviewedById:actorId,reviewedAt:now,reviewReason:reviewReason.trim()}});
        await tx.auditLog.create({data:{schoolId,userId:actorId,action:"UPDATE",
          entityType:"INTERNAL_MOCK_CORRECTION",entityId:id,
          newValues:{decision:"REJECTED",reviewReason:reviewReason.trim()}}});
        return {id,status:"REJECTED",reissued:0};
      }
      const session=await tx.internalExamSession.findFirst({
        where:{id:item.sessionId,schoolId,status:"LOCKED"},
        select:{candidates:{select:{id:true}}},
      });
      if(!session)throw new ConflictException("The examination must remain locked.");
      const history=await tx.internalMockReport.findMany({
        where:{schoolId,sessionId:item.sessionId},orderBy:{version:"desc"},
        select:{candidateId:true,studentId:true,version:true,stage:true,snapshot:true,snapshotHash:true},
      });
      const latest=new Map<string,typeof history[number]>();
      for(const row of history)if(!latest.has(row.candidateId))latest.set(row.candidateId,row);
      if(latest.size!==session.candidates.length||
        [...latest.values()].some(r=>r.stage!=="PUBLISHED"||snapshotHash(r.snapshot)!==r.snapshotHash)){
        throw new ConflictException("Publish the previous reissue before approving another correction.");
      }
      const base=latest.get(item.candidateId);
      if(!base||base.version!==item.baseVersion){
        throw new ConflictException("The correction request is stale and must be resubmitted.");
      }
      const current=(base.snapshot as unknown as MockSnapshot).papers.find(p=>p.id===item.paperId);
      if(!current||current.status!==item.previousStatus||
        current.mark!==(item.previousMarks===null?null:Number(item.previousMarks))){
        throw new ConflictException("The published source no longer matches the proposed correction.");
      }
      const change={candidateId:item.candidateId,paperId:item.paperId,
        status:item.requestedStatus,marks:item.requestedMarks===null?null:Number(item.requestedMarks)};
      const revisions=reviseMockCohort([...latest.values()].map(r=>({
        candidateId:r.candidateId,studentId:r.studentId,version:r.version,
        snapshot:r.snapshot as unknown as MockSnapshot,
      } satisfies MockRevisionRow)),change,{correctionId:id,approvedAt:now.toISOString()});
      for(const revised of revisions){
        await tx.internalMockReport.create({data:{
          schoolId,sessionId:item.sessionId,candidateId:revised.candidateId,
          studentId:revised.studentId,version:revised.version,
          snapshot:revised.snapshot as unknown as Prisma.InputJsonValue,
          snapshotHash:snapshotHash(revised.snapshot),
        }});
      }
      await tx.internalMockCorrection.update({where:{id},data:{
        status:"APPLIED",reviewedById:actorId,reviewedAt:now,reviewReason:reviewReason.trim(),
      }});
      await tx.auditLog.create({data:{schoolId,userId:actorId,action:"UPDATE",
        entityType:"INTERNAL_MOCK_CORRECTION",entityId:id,
        newValues:{decision:"APPLIED",reviewReason:reviewReason.trim(),
          reissued:revisions.length,sourceVersions:revisions.map(r=>({
            candidateId:r.candidateId,version:r.version,
            hash:snapshotHash(r.snapshot),
          }))}}});
      return {id,status:"APPLIED",reissued:revisions.length,
        next:"New versions require class-teacher recommendation, distinct headteacher approval and publication."};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:30000});
  }
}
