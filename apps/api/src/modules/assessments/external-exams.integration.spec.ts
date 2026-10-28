import {afterAll,beforeAll,describe,expect,it} from "vitest";
import type {PrismaClient} from "@prisma/client";
import type {ExternalExamsService as ExternalService} from "./external-exams.service.js";

const url=process.env.TEST_DATABASE_URL??"";
const enabled=(()=>{try{return /test/i.test(new URL(url).pathname);}catch{return false;}})();
describe.skipIf(!enabled)("staff-only BECE register (PostgreSQL)",{timeout:90000},()=>{
  let db:PrismaClient,exams:ExternalService;
  const tag="bx"+Date.now().toString(36);
  const orgA=tag+"A",orgB=tag+"B",admin=tag+"admin",teacher=tag+"teacher",
    head=tag+"head",pupil=tag+"pupil",outsider=tag+"outsider";
  let schoolId="",otherSchool="",classId="",sessionId="",paperId="",candidateId="",profileId="";
  let academicYearId="";
  beforeAll(async()=>{
    process.env.DATABASE_URL=url;
    const {prisma}=await import("../../prisma/prisma.client.js");db=prisma;
    const {ExternalExamsService}=await import("./external-exams.service.js");
    await db.organization.create({data:{id:orgA,name:"Synthetic BECE A",slug:orgA}});
    await db.organization.create({data:{id:orgB,name:"Synthetic BECE B",slug:orgB}});
    schoolId=(await db.school.create({data:{organizationId:orgA,name:"Synthetic BECE School",
      code:(tag+"A").toUpperCase(),subdomain:tag+"a"}})).id;
    otherSchool=(await db.school.create({data:{organizationId:orgB,name:"Other School",
      code:(tag+"B").toUpperCase(),subdomain:tag+"b"}})).id;
    for(const id of [admin,teacher,head,pupil,outsider]){
      await db.user.create({data:{id,name:id,email:id+"@example.test"}});
    }
    profileId=(await db.userProfile.create({data:{userId:pupil,firstName:"Synthetic",
      lastName:"Candidate"}})).id;
    const year=await db.academicYear.create({data:{schoolId,name:"2026/2027",
      startDate:new Date("2026-01-01"),endDate:new Date("2026-12-31")}});
    academicYearId=year.id;
    const term=await db.term.create({data:{academicYearId,name:"Term 1",
      termNumber:1,startDate:new Date("2026-01-01"),endDate:new Date("2026-04-30")}});
    classId=(await db.class.create({data:{schoolId,academicYearId,name:"Synthetic JHS 3",
      level:"JHS3",isGraduatingClass:true}})).id;
    const subject=await db.subject.create({data:{schoolId,name:"Computing",code:tag+"CMP"}});
    await db.classSubject.create({data:{classId,subjectId:subject.id}});
    const studentId=(await db.student.create({data:{schoolId,profileId,classId,
      studentId:tag+"candidate"}})).id;
    await db.enrollment.create({data:{studentId,classId,academicYearId,termId:term.id,status:"ACTIVE"}});
    const assignments={teacherId:teacher,classTeacherClassIds:[classId],subjectAssignments:[]};
    exams=new ExternalExamsService({client:db} as never,{
      getAssignments:async (_school:string,userId:string)=>userId===teacher?assignments:
        {teacherId:null,classTeacherClassIds:[],subjectAssignments:[]},
    } as never);
  });
  afterAll(async()=>{
    if(!db)return;
    try{
      if(schoolId)await db.auditLog.deleteMany({where:{schoolId}});
      if(schoolId)await db.externalExamSession.deleteMany({where:{schoolId}});
      if(schoolId)await db.school.delete({where:{id:schoolId}});
      if(otherSchool)await db.school.delete({where:{id:otherSchool}});
      await db.organization.deleteMany({where:{id:{in:[orgA,orgB]}}});
      if(profileId)await db.userProfile.delete({where:{id:profileId}}).catch(()=>undefined);
      await db.user.deleteMany({where:{id:{in:[admin,teacher,head,pupil,outsider]}}});
    }finally{await db.$disconnect();}
  });

  it("creates a frozen one-year register and rejects duplication or cross-school access",async()=>{
    const created=await exams.create(schoolId,admin,"admin",{
      academicYearId,classId,examYear:2026,
    });
    expect(created).toMatchObject({name:"BECE 2026",status:"DRAFT",
      _count:{candidates:1,papers:1}});
    sessionId=created.id;
    const paper=await db.externalExamPaper.findFirstOrThrow({where:{sessionId}});
    paperId=paper.id;
    candidateId=(await db.externalExamCandidate.findFirstOrThrow({where:{sessionId}})).id;
    await expect(exams.create(schoolId,admin,"admin",{
      academicYearId,classId,examYear:2026,
    })).rejects.toThrow(/already/i);
    await expect(exams.create(otherSchool,admin,"admin",{
      academicYearId,classId,examYear:2026,
    })).rejects.toThrow(/does not belong/i);
    await expect(exams.sheet(otherSchool,admin,"admin",paperId)).rejects.toThrow(/not found/i);
    await expect(exams.sheet(schoolId,outsider,"student",paperId)).rejects.toThrow(/staff-only/i);
    await expect(exams.list(schoolId,outsider,"guardian")).rejects.toThrow(/staff-only/i);
    expect(await exams.list(schoolId,outsider,"teacher")).toEqual([]);
  });

  it("requires open status, school-scope and source evidence",async()=>{
    const body={paperId,sourceReference:"School-held BECE statement page 1",
      entries:[{candidateId,status:"GRADED" as const,grade:1,expectedVersion:0}]};
    await expect(exams.save(schoolId,teacher,"teacher",body)).rejects.toThrow(/locked/i);
    await exams.open(schoolId,admin,"admin",sessionId);
    await expect(exams.save(schoolId,outsider,"teacher",body)).rejects.toThrow(/appointed class teacher/i);
    await expect(exams.save(otherSchool,admin,"admin",body)).rejects.toThrow(/not found/i);
    await exams.save(schoolId,teacher,"teacher",body);
    await expect(exams.save(schoolId,teacher,"teacher",body)).rejects.toThrow(/changed/i);
    const result=await db.externalExamResult.findFirstOrThrow({where:{paperId}});
    expect(result).toMatchObject({grade:1,status:"GRADED",version:1,
      sourceReference:"School-held BECE statement page 1"});
    await expect(db.externalExamResult.update({where:{id:result.id},
      data:{status:"GRADED",grade:10}})).rejects.toThrow();
  });

  it("indexes candidates with version checks and gives descriptive, not invented, analytics",async()=>{
    await expect(exams.indexNumber(schoolId,teacher,"teacher",candidateId,"0001234567",1))
      .rejects.toThrow(/administrators/i);
    const index=await exams.indexNumber(schoolId,admin,"admin",candidateId,"0001234567",1);
    expect(index).toMatchObject({indexNumber:"0001234567",version:2});
    await expect(exams.indexNumber(schoolId,admin,"admin",candidateId,"0007654321",1))
      .rejects.toThrow(/changed/i);
    const overview=await exams.summary(schoolId,teacher,"teacher",sessionId);
    expect(overview).toMatchObject({source:"SCHOOL_ENTERED_UNVERIFIED",
      candidateCount:1,missingIndexNumbers:0,
      papers:[{recorded:1,pending:0,statuses:{GRADED:1}}]});
    expect(overview.papers[0]!.grades.find(g=>g.grade===1)?.count).toBe(1);
    expect("passRate" in overview).toBe(false);
    await expect(exams.summary(otherSchool,admin,"admin",sessionId)).rejects.toThrow(/not found/i);
  });

  it("requires independent headteacher attestation and freezes the register",async()=>{
    await expect(exams.lock(schoolId,admin,"admin",sessionId)).rejects.toThrow(/headteacher/i);
    const signed=await exams.lock(schoolId,head,"headteacher",sessionId);
    expect(signed.status).toBe("LOCKED");
    await expect(exams.save(schoolId,teacher,"teacher",{paperId,
      sourceReference:"Corrected school statement",entries:[{
        candidateId,status:"WITHHELD",grade:null,expectedVersion:1,
      }]})).rejects.toThrow(/locked/i);
    const original=await db.externalExamResult.findFirstOrThrow({where:{paperId}});
    await expect(db.externalExamResult.update({where:{id:original.id},
      data:{status:"ABSENT",grade:null}})).rejects.toThrow();
    await expect(exams.indexNumber(schoolId,admin,"admin",candidateId,"0009999999",2))
      .rejects.toThrow(/only while the register is open/i);
    const eventCount=await db.auditLog.count({
      where:{schoolId,entityType:{in:["EXTERNAL_BECE_RESULT","EXTERNAL_BECE_INDEX","EXTERNAL_BECE_SESSION"]}},
    });
    expect(eventCount).toBeGreaterThanOrEqual(4);
  });
});
