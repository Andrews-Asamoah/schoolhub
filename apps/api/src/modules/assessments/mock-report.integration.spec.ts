import { afterAll,beforeAll,describe,expect,it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { InternalExamsService as ExamType } from "./internal-exams.service.js";
import type { MockReportService as ReportType } from "./mock-report.service.js";
const url=process.env.TEST_DATABASE_URL??"";
const enabled=(()=>{try{return /test/i.test(new URL(url).pathname)}catch{return false}})();
describe.skipIf(!enabled)("mock reports: locked sources, grading, sign-offs and tenancy (PostgreSQL)",{timeout:90000},()=>{
  let db:PrismaClient,exams:ExamType,reports:ReportType;
  const tag="mr"+Date.now().toString(36);
  const org=tag+"-org",admin=tag+"-admin",teacher=tag+"-teacher",head=tag+"-head",pupil=tag+"-pupil",outsider=tag+"-outsider";
  let schoolId="",classId="",sessionId="",gradingId="",reportId="",profileId="";
  beforeAll(async()=>{
    process.env.DATABASE_URL=url;
    const {prisma}=await import("../../prisma/prisma.client.js");db=prisma;
    const {InternalExamsService}=await import("./internal-exams.service.js");
    const {MockReportService}=await import("./mock-report.service.js");
    await db.organization.create({data:{id:org,name:"Report Test",slug:org}});
    schoolId=(await db.school.create({data:{organizationId:org,name:"Report Test School",
      code:tag.toUpperCase(),subdomain:tag}})).id;
    for(const id of [admin,teacher,head,pupil,outsider])
      await db.user.create({data:{id,name:id,email:id+"@example.test"}});
    profileId=(await db.userProfile.create({data:{
      userId:pupil,firstName:"Synthetic",lastName:"Pupil"}})).id;
    const year=await db.academicYear.create({data:{schoolId,name:tag+" 2026",
      startDate:new Date("2026-01-01"),endDate:new Date("2026-12-31"),isCurrent:true}});
    const term=await db.term.create({data:{academicYearId:year.id,name:"Term 1",
      termNumber:1,startDate:new Date("2026-09-01"),endDate:new Date("2026-12-18"),isCurrent:true}});
    classId=(await db.class.create({data:{schoolId,academicYearId:year.id,
      name:"Synthetic JHS3",level:"JHS3",isGraduatingClass:true}})).id;
    const subject=await db.subject.create({data:{schoolId,name:"Computing",code:tag+"CMP"}});
    await db.classSubject.create({data:{classId,subjectId:subject.id}});
    const studentId=(await db.student.create({data:{schoolId,profileId,classId,
      studentId:tag+"-stu"}})).id;
    await db.enrollment.create({data:{studentId,classId,academicYearId:year.id,
      termId:term.id,status:"ACTIVE"}});
    gradingId=(await db.gradingSystem.create({data:{schoolId,name:"School grading",
      code:tag+"GRADE",isActive:true,isSchoolDefault:true,
      gradeScales:{create:[
        {grade:"A",description:"Excellent",minScore:80,maxScore:100,gradePoint:1,displayOrder:0},
        {grade:"B",description:"Good",minScore:60,maxScore:79,gradePoint:2,displayOrder:1},
        {grade:"C",description:"Developing",minScore:0,maxScore:59,gradePoint:3,displayOrder:2},
      ]}}})).id;
    const scope={getAssignments:async (_school:string,user:string)=>user===teacher?
      {teacherId:teacher,classTeacherClassIds:[classId],
        subjectAssignments:[{classId,subjectId:subject.id}]}:
      {teacherId:null,classTeacherClassIds:[],subjectAssignments:[]}};
    exams=new InternalExamsService({client:db} as never,scope as never);
    reports=new MockReportService({client:db} as never,scope as never);
    const session=await exams.create(schoolId,admin,"admin",classId);
    sessionId=session.id;
    const paper=await db.internalExamPaper.findFirstOrThrow({where:{sessionId}});
    const candidate=await db.internalExamCandidate.findFirstOrThrow({where:{sessionId}});
    await exams.open(schoolId,admin,"admin",sessionId);
    await exams.save(schoolId,teacher,"teacher",{paperId:paper.id,entries:[{
      candidateId:candidate.id,status:"MARKED",marks:84,expectedVersion:0,
    }]});
    await exams.finalizePaper(schoolId,teacher,"teacher",paper.id);
    await exams.lock(schoolId,admin,"admin",sessionId);
  });
  afterAll(async()=>{
    if(!db)return;
    try{
      // Release-stage tests deliberately stop before PUBLISHED:
      // published report retention is enforced in the database.
      await db.internalMockReport.deleteMany({where:{schoolId}});
      await db.auditLog.deleteMany({where:{schoolId}});
      if(schoolId)await db.internalExamSession.deleteMany({where:{schoolId}});
      if(schoolId)await db.school.delete({where:{id:schoolId}});
      await db.organization.delete({where:{id:org}});
      if(profileId)await db.userProfile.delete({where:{id:profileId}}).catch(()=>undefined);
      await db.user.deleteMany({where:{id:{in:[admin,teacher,head,pupil,outsider]}}});
    }finally{await db.$disconnect()}
  });
  it("requires a LOCKED mock and freezes school grading and class ranking",async()=>{
    const generated=await reports.generate(schoolId,admin,"admin",sessionId,gradingId);
    expect(generated.generated).toBe(1);
    const review=await reports.review(schoolId,admin,"admin",sessionId);
    expect(review.reports).toHaveLength(1);
    const r=review.reports[0]!;
    reportId=r.id;
    expect(r.integrityOk).toBe(true);
    const snapshot=r.snapshot as unknown as {kind:string;average:number;position:number;
      papers:{grade:string;mark:number}[]};
    expect(snapshot).toMatchObject({kind:"INTERNAL_MOCK",average:84,position:1});
    expect(snapshot.papers[0]).toMatchObject({grade:"A",mark:84});
    await expect(reports.generate(schoolId,admin,"admin",sessionId,gradingId)).rejects.toThrow(/already generated/i);
  });
  it("denies unassigned teacher and unsigned publication",async()=>{
    await expect(reports.review(schoolId,outsider,"teacher",sessionId)).rejects.toThrow(/class teacher/i);
    await expect(reports.publish(schoolId,admin,"admin",sessionId)).rejects.toThrow(/every pupil/i);
    await expect(reports.pdf(schoolId,pupil,reportId,"student")).rejects.toThrow(/not found/i);
    expect(await reports.published(schoolId,pupil,"student")).toEqual([]);
  });
  it("requires separate teacher/headteacher sign-offs and prevents source tampering",async()=>{
    await expect(reports.recommend(schoolId,outsider,"teacher",reportId,
      "Great academic development throughout the term.")).rejects.toThrow(/class teacher/i);
    await reports.recommend(schoolId,teacher,"teacher",reportId,
      "Shows sound preparation and steady progress in Computing.");
    await expect(reports.headApprove(schoolId,teacher,"headteacher",reportId,
      "Continue revision and practical work.")).rejects.toThrow(/one person/i);
    await reports.headApprove(schoolId,head,"headteacher",reportId,
      "Demonstrates promising readiness for the final examination.");
    await expect(db.internalMockReport.update({
      where:{id:reportId},data:{snapshotHash:"tampered"},
    })).rejects.toThrow();
    const record=await db.internalMockReport.findUniqueOrThrow({where:{id:reportId}});
    expect(record).toMatchObject({stage:"APPROVED",teacherActorId:teacher,headActorId:head});
    expect(await db.auditLog.count({where:{schoolId,entityType:"INTERNAL_MOCK_REPORT"}})).toBe(2);
  });
});
