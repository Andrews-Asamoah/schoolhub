import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { snapshotHash } from "./report-version.js";
import type { ReportVersionService as VersionType } from "./report-version.service.js";
import type { ReportPublicationService as PublishType } from "./report-publication.service.js";

const url = process.env.TEST_DATABASE_URL ?? "";
const enabled=(()=>{try{return /test/i.test(new URL(url).pathname);}catch{return false;}})();
describe.skipIf(!enabled)("versioned academic reports (PostgreSQL)",{timeout:90_000},()=>{
  let db:PrismaClient, versions:VersionType, publisher:PublishType;
  const tag="rv"+Date.now().toString(36);
  const orgA=tag+"-orgA",orgB=tag+"-orgB";
  const teacher=tag+"-teacher",head=tag+"-head",studentUser=tag+"-student",outsider=tag+"-outside";
  let schoolId="",foreignSchoolId="",classId="",studentId="",setId="",versionId="",reportId="",profileId="";
  const snap={
    schemaVersion:1, report:{student:{class:{name:"JHS3",level:"JHS3",id:"sample"}},
      subjects:[{subject:{name:"Computing",code:"CMP"},percentage:85,totalScore:85,grade:"A"}],remarks:[]},
    school:{name:"Synthetic School",code:"SYN"},template:{name:"Academic Report",layout:{}},
    student:{name:"Synthetic Student",admissionNumber:"TEST-123"},
    year:"2026/27",term:"Term 1",set:"Academic Term Report",capturedAt:"2026-10-27T00:00:00Z",
  };
  beforeAll(async()=>{
    process.env.DATABASE_URL=url;
    const {prisma}=await import("../../prisma/prisma.client.js");db=prisma;
    const {ReportVersionService}=await import("./report-version.service.js");
    const {ReportPublicationService}=await import("./report-publication.service.js");
    await db.organization.create({data:{id:orgA,name:"Synthetic A",slug:orgA}});
    await db.organization.create({data:{id:orgB,name:"Synthetic B",slug:orgB}});
    schoolId=(await db.school.create({data:{
      organizationId:orgA,name:"Synthetic School",code:(tag+"A").toUpperCase(),subdomain:tag+"a"}})).id;
    foreignSchoolId=(await db.school.create({data:{
      organizationId:orgB,name:"Other School",code:(tag+"B").toUpperCase(),subdomain:tag+"b"}})).id;
    for(const id of [teacher,head,studentUser,outsider]) await db.user.create({
      data:{id,name:id,email:id+"@example.test"},
    });
    profileId=(await db.userProfile.create({data:{
      userId:studentUser,firstName:"Synthetic",lastName:"Student"}})).id;
    const academicYear=await db.academicYear.create({data:{
      schoolId,name:"2026/27",startDate:new Date("2026-01-01"),endDate:new Date("2026-12-31")}});
    const term=await db.term.create({data:{academicYearId:academicYear.id,name:"Term 1",
      termNumber:1,startDate:new Date("2026-09-01"),endDate:new Date("2026-12-18")}});
    classId=(await db.class.create({data:{
      schoolId,academicYearId:academicYear.id,name:"Synthetic JHS3",level:"JHS3"}})).id;
    studentId=(await db.student.create({data:{
      schoolId,studentId:tag+"-stu",profileId,classId}})).id;
    const template=await db.reportCardTemplate.create({data:{
      schoolId,name:"Academic Report",layout:{type:"modern"}}});
    setId=(await db.reportCardSet.create({data:{
      schoolId,templateId:template.id,academicYearId:academicYear.id,termId:term.id,
      name:"Synthetic Terminal",status:"GENERATED"}})).id;
    reportId=(await db.reportCard.create({data:{setId,studentId,data:snap.report}})).id;
    versionId=(await db.reportCardVersion.create({data:{
      schoolId,setId,studentId,classId,version:1,snapshot:snap,snapshotHash:snapshotHash(snap),
    }})).id;
    versions=new ReportVersionService({client:db} as never,{
      getAssignments:async (_school:string,actor:string)=>({
        teacherId:actor===teacher?actor:null,
        classTeacherClassIds:actor===teacher?[classId]:[],subjectAssignments:[],
      }),
    } as never);
    publisher=new ReportPublicationService({client:db} as never);
  });
  afterAll(async()=>{
    if(!db)return;
    try{
      await db.auditLog.deleteMany({where:{schoolId}});
      if(schoolId)await db.school.delete({where:{id:schoolId}}).catch(()=>undefined);
      if(foreignSchoolId)await db.school.delete({where:{id:foreignSchoolId}}).catch(()=>undefined);
      await db.organization.deleteMany({where:{id:{in:[orgA,orgB]}}});
      if(profileId)await db.userProfile.delete({where:{id:profileId}}).catch(()=>undefined);
      await db.user.deleteMany({where:{id:{in:[teacher,head,studentUser,outsider]}}});
    }finally{await db.$disconnect();}
  });

  it("refuses publication and review without both independent approvals",async()=>{
    await expect(publisher.markReviewed(schoolId,head,setId)).rejects.toThrow(/class-teacher|headteacher/i);
    await expect(publisher.publish(schoolId,head,setId)).rejects.toThrow(/review/i);
  });
  it("rejects a teacher outside the assigned class and a cross-school version",async()=>{
    await expect(versions.recommend(schoolId,outsider,versionId,"An excellent pupil overall."))
      .rejects.toThrow(/class teacher/i);
    await expect(versions.recommend(foreignSchoolId,teacher,versionId,"An excellent pupil overall."))
      .rejects.toThrow(/not found/i);
  });
  it("requires separate actors and preserves original teacher approval",async()=>{
    const result=await versions.recommend(schoolId,teacher,versionId,
      "Strong academic progress and consistent attendance.");
    expect(result.stage).toBe("TEACHER_REVIEWED");
    await expect(versions.recommend(schoolId,teacher,versionId,"Another recommendation"))
      .rejects.toThrow(/already|superseded/i);
    await expect(versions.headteacherApprove(schoolId,teacher,versionId,"Satisfactory"))
      .rejects.toThrow(/same person/i);
    const approved=await versions.headteacherApprove(schoolId,head,versionId,
      "Continue with the recommended support and revision.");
    expect(approved.stage).toBe("APPROVED");
    await expect(db.reportCardVersion.update({
      where:{id:versionId},data:{snapshotHash:"tampered"},
    })).rejects.toThrow();
    const row=await db.reportCardVersion.findUniqueOrThrow({where:{id:versionId}});
    expect(row.teacherActorId).toBe(teacher);
    expect(row.headActorId).toBe(head);
  });
  it("publishes approved versions and rejects cross-student private downloads",async()=>{
    const reviewed=await publisher.markReviewed(schoolId,head,setId);
    expect(reviewed.isReviewed).toBe(true);
    const published=await publisher.publish(schoolId,head,setId);
    expect(published.status).toBe("PUBLISHED");
    const owner=await versions.publishedPdf(schoolId,studentUser,reportId,"student");
    expect(owner.pdf.subarray(0,4).toString("utf8")).toBe("%PDF");
    await expect(versions.publishedPdf(schoolId,outsider,reportId,"student"))
      .rejects.toThrow(/not found/i);
    await expect(versions.publishedPdf(schoolId,outsider,reportId,"guardian"))
      .rejects.toThrow(/not found/i);
    await expect(versions.publishedPdf(foreignSchoolId,studentUser,reportId,"student"))
      .rejects.toThrow(/not found/i);
    await expect(db.reportCardVersion.update({
      where:{id:versionId},data:{headRemark:"Changed after publication"},
    })).rejects.toThrow();
  });
});
