import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {Prisma,type PrismaClient} from "@prisma/client";
import {snapshotHash,type MockSnapshot} from "./mock-report.js";
import type {MockCorrectionService as CorrectionType} from "./mock-correction.service.js";
import type {MockReportService as ReportsType} from "./mock-report.service.js";
const url=process.env.TEST_DATABASE_URL??"";
const enabled=(()=>{try{return /test/i.test(new URL(url).pathname)}catch{return false}})();
describe.skipIf(!enabled)("controlled published mock corrections (PostgreSQL)",{timeout:90000},()=>{
  let db:PrismaClient,service:CorrectionType,reports:ReportsType;
  const tag="mc"+Date.now().toString(36),org=tag+"org";
  const manager=tag+"manager",teacher=tag+"teacher",head=tag+"head";
  const pupil=tag+"pupil",outsider=tag+"outsider";
  let schoolId="",sessionId="",candidateId="",paperId="",profileId="",originalId="",correctionId="";
  beforeAll(async()=>{
    process.env.DATABASE_URL=url;
    const {prisma}=await import("../../prisma/prisma.client.js");db=prisma;
    const {MockCorrectionService}=await import("./mock-correction.service.js");
    const {MockReportService}=await import("./mock-report.service.js");
    await db.organization.create({data:{id:org,name:"Synthetic Correction",slug:org}});
    schoolId=(await db.school.create({data:{organizationId:org,name:"Synthetic Correction School",
      code:tag.toUpperCase(),subdomain:tag}})).id;
    for(const id of [manager,teacher,head,pupil,outsider])await db.user.create({
      data:{id,name:id,email:id+"@example.test"},
    });
    profileId=(await db.userProfile.create({data:{userId:pupil,firstName:"Synthetic",lastName:"Pupil"}})).id;
    const year=await db.academicYear.create({data:{schoolId,name:"Correction Year",
      startDate:new Date("2026-01-01"),endDate:new Date("2026-12-31"),isCurrent:true}});
    const term=await db.term.create({data:{academicYearId:year.id,name:"Term 1",termNumber:1,
      startDate:new Date("2026-09-01"),endDate:new Date("2026-12-18"),isCurrent:true}});
    const cls=await db.class.create({data:{schoolId,academicYearId:year.id,
      name:"Correction JHS3",level:"JHS3",isGraduatingClass:true}});
    const subject=await db.subject.create({data:{schoolId,name:"Computing",code:tag+"CMP"}});
    await db.classSubject.create({data:{classId:cls.id,subjectId:subject.id}});
    const student=await db.student.create({data:{schoolId,profileId,classId:cls.id,studentId:tag+"-S"}});
    await db.enrollment.create({data:{studentId:student.id,classId:cls.id,academicYearId:year.id,
      termId:term.id,status:"ACTIVE"}});
    sessionId=(await db.internalExamSession.create({data:{
      schoolId,academicYearId:year.id,termId:term.id,classId:cls.id,mockNumber:1,
      name:"Mock 1",status:"LOCKED",lockedAt:new Date(),
    }})).id;
    candidateId=(await db.internalExamCandidate.create({data:{
      sessionId,studentId:student.id,nameSnapshot:"Synthetic Pupil",
      admissionNumberSnapshot:"TEST-01",
    }})).id;
    paperId=(await db.internalExamPaper.create({data:{sessionId,subjectId:subject.id,
      nameSnapshot:"Computing",codeSnapshot:"CMP",maxMarks:100,finalizedAt:new Date()},
    })).id;
    const source:MockSnapshot={schemaVersion:1,kind:"INTERNAL_MOCK",
      name:"Mock 1",number:1,school:{name:"Synthetic Correction School",code:tag.toUpperCase()},
      year:"Correction Year",term:"Term 1",className:"Correction JHS3",
      pupil:{name:"Synthetic Pupil",admissionNumber:"TEST-01"},
      papers:[{id:paperId,name:"Computing",code:"CMP",maxMarks:100,
        mark:84,status:"MARKED",percentage:84,grade:"A"}],
      grading:{name:"School grades",bands:[
        {grade:"A",min:80,max:100,description:"Excellent"},
        {grade:"B",min:0,max:79,description:"Other"},
      ],scoreRounding:"NEAREST_WHOLE_PERCENT"},
      average:84,position:1,positionMethod:"COMPETITION",capturedAt:"2026-10-28T00:00:00Z"};
    originalId=(await db.internalMockReport.create({data:{
      schoolId,sessionId,candidateId,studentId:student.id,version:1,stage:"PUBLISHED",
      snapshot:source as unknown as Prisma.InputJsonValue,snapshotHash:snapshotHash(source),
      teacherActorId:teacher,teacherName:"Class Teacher",
      teacherRemark:"Excellent effort in the examinations.",teacherApprovedAt:new Date(),
      headActorId:head,headName:"Headteacher",
      headRemark:"Continue to work with diligence.",headApprovedAt:new Date(),
      publishedAt:new Date(),
    }})).id;
    const scope={getAssignments:async (_school:string,user:string)=>user===teacher?
      {teacherId:teacher,classTeacherClassIds:[cls.id],
        subjectAssignments:[{classId:cls.id,subjectId:subject.id}]}:
      {teacherId:null,classTeacherClassIds:[],subjectAssignments:[]}};
    service=new MockCorrectionService({client:db} as never,scope as never);
    reports=new MockReportService({client:db} as never,scope as never);
  });
  afterAll(async()=>{
    if(!db)return;
    try{
      // Test database only: temporarily bypass append-only guards solely to
      // discard synthetic fixtures, always restoring them in finally.
      await db.$executeRawUnsafe('ALTER TABLE "internal_mock_corrections" DISABLE TRIGGER schoolhub_mock_correction_guard_trigger');
      await db.$executeRawUnsafe('ALTER TABLE "internal_mock_reports" DISABLE TRIGGER schoolhub_mock_report_retain_update');
      try{
        if(schoolId){
          await db.internalMockCorrection.deleteMany({where:{schoolId}});
          await db.internalMockReport.deleteMany({where:{schoolId}});
          await db.auditLog.deleteMany({where:{schoolId}});
          await db.internalExamSession.deleteMany({where:{schoolId}});
          await db.school.delete({where:{id:schoolId}});
        }
      }finally{
        await db.$executeRawUnsafe('ALTER TABLE "internal_mock_reports" ENABLE TRIGGER schoolhub_mock_report_retain_update');
        await db.$executeRawUnsafe('ALTER TABLE "internal_mock_corrections" ENABLE TRIGGER schoolhub_mock_correction_guard_trigger');
      }
      await db.organization.delete({where:{id:org}});
      if(profileId)await db.userProfile.delete({where:{id:profileId}}).catch(()=>undefined);
      await db.user.deleteMany({where:{id:{in:[manager,teacher,head,pupil,outsider]}}});
    }finally{await db.$disconnect();}
  });
  it("denies unauthorised/incorrectly scoped requests and edits only published sources",async()=>{
    await expect(service.request(schoolId,outsider,"teacher",sessionId,{
      candidateId,paperId,status:"MARKED",marks:94,expectedVersion:1,reason:"Paper checked and mark verified.",
    })).rejects.toThrow(/assigned subject teacher/i);
    await expect(service.request(schoolId,teacher,"teacher",sessionId,{
      candidateId,paperId,status:"MARKED",marks:94,expectedVersion:3,reason:"Paper checked and mark verified.",
    })).rejects.toThrow(/version changed/i);
  });
  it("records one correction request and enforces maker-checker separation",async()=>{
    const input={candidateId,paperId,status:"MARKED" as const,marks:94,
      expectedVersion:1,reason:"Verified transcription mistake on the answer sheet."};
    const record=await service.request(schoolId,teacher,"teacher",sessionId,input);
    correctionId=record.id;
    await expect(service.request(schoolId,manager,"admin",sessionId,input))
      .rejects.toThrow(/existing pending/i);
    await expect(service.decide(schoolId,teacher,"headteacher",correctionId,true,
      "Confirmed by reviewing the marked examination booklet.")).rejects.toThrow(/different headteacher/i);
    expect((await service.list(schoolId,manager,"admin",sessionId)).length).toBe(1);
  });
  it("approves an atomic all-pupil new version; previous published PDF remains intact until release",async()=>{
    const applied=await service.decide(schoolId,head,"headteacher",correctionId,true,
      "Confirmed the original paper and independent total calculation.");
    expect(applied).toMatchObject({status:"APPLIED",reissued:1});
    const rows=await db.internalMockReport.findMany({
      where:{schoolId,sessionId},orderBy:{version:"asc"},
    });
    expect(rows.map(x=>x.stage)).toEqual(["PUBLISHED","GENERATED"]);
    expect(rows.map(x=>x.version)).toEqual([1,2]);
    expect(snapshotHash(rows[0]!.snapshot)).toBe(rows[0]!.snapshotHash);
    const corrected=rows[1]!.snapshot as unknown as MockSnapshot;
    expect(corrected.papers[0]!.mark).toBe(94);
    expect(corrected.average).toBe(94);
    expect(corrected.correction?.requestId).toBe(correctionId);
    expect((await reports.published(schoolId,pupil,"student")).map(x=>x.id)).toEqual([originalId]);
    await expect(service.request(schoolId,manager,"admin",sessionId,{
      candidateId,paperId,status:"MARKED",marks:99,expectedVersion:1,
      reason:"Another proposed transcription correction.",
    })).rejects.toThrow(/publish the current/i);
    await expect(db.internalMockReport.update({
      where:{id:originalId},data:{snapshotHash:"tampered"},
    })).rejects.toThrow();
  });
  it("retains correction decision and signed-off history as immutable evidence",async()=>{
    await expect(db.internalMockCorrection.update({
      where:{id:correctionId},data:{reason:"Altered after decision"},
    })).rejects.toThrow();
    const stored=await db.internalMockCorrection.findUniqueOrThrow({where:{id:correctionId}});
    expect(stored).toMatchObject({status:"APPLIED",requestedById:teacher,reviewedById:head});
    const events=await db.auditLog.count({where:{schoolId,entityType:"INTERNAL_MOCK_CORRECTION"}});
    expect(events).toBe(2);
  });
  it("requires fresh independent signoffs and releases only latest corrected PDFs to families",async()=>{
    const current=await reports.review(schoolId,manager,"admin",sessionId);
    expect(current.reports).toHaveLength(1);
    expect(current.generated).toBe(1);
    expect(current.historicalVersions).toBe(1);
    const updated=current.reports[0]!;
    expect(updated.stage).toBe("GENERATED");
    await expect(reports.publish(schoolId,manager,"admin",sessionId)).rejects.toThrow(/every pupil/i);
    await reports.recommend(schoolId,teacher,"teacher",updated.id,
      "After the verified correction, the pupil performed excellently.");
    await reports.headApprove(schoolId,head,"headteacher",updated.id,
      "The corrected marks are confirmed and approved for release.");
    const result=await reports.publish(schoolId,manager,"admin",sessionId);
    expect(result.published).toBe(1);
    expect((await reports.published(schoolId,pupil,"student")).map(x=>x.id)).toEqual([updated.id]);
    await expect(reports.pdf(schoolId,pupil,originalId,"student")).rejects.toThrow(/replaced/i);
    const file=await reports.pdf(schoolId,pupil,updated.id,"student");
    expect(file.content.subarray(0,4).toString()).toBe("%PDF");
    await expect(reports.pdf(schoolId,outsider,updated.id,"student")).rejects.toThrow(/not found/i);
    await expect(db.internalMockReport.update({
      where:{id:updated.id},data:{headRemark:"Secret modification"},
    })).rejects.toThrow();
  });
});
