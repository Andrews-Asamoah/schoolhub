import { afterAll,beforeAll,describe,expect,it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { InternalExamsService as ServiceType } from "./internal-exams.service.js";
const url=process.env.TEST_DATABASE_URL??"";
const enabled=(()=>{try{return /test/i.test(new URL(url).pathname)}catch{return false}})();
describe.skipIf(!enabled)("numbered mock exams: PostgreSQL tenancy, subjects and locks",{timeout:90000},()=>{
  let db:PrismaClient,service:ServiceType;
  const tag="mx"+Date.now().toString(36);
  const orgA=tag+"orgA",orgB=tag+"orgB";
  const actor=tag+"manager",teacher=tag+"teacher",other=tag+"other",stuUser=tag+"pupil";
  let schoolId="",schoolB="",classId="",studentId="",paperId="",sessionId="",profileId="";
  beforeAll(async()=>{
    process.env.DATABASE_URL=url;
    const {prisma}=await import("../../prisma/prisma.client.js");db=prisma;
    const {InternalExamsService}=await import("./internal-exams.service.js");
    await db.organization.create({data:{id:orgA,name:"Synthetic A",slug:orgA}});
    await db.organization.create({data:{id:orgB,name:"Synthetic B",slug:orgB}});
    schoolId=(await db.school.create({data:{organizationId:orgA,name:"Synthetic Exam School",
      code:(tag+"A").toUpperCase(),subdomain:tag+"a"}})).id;
    schoolB=(await db.school.create({data:{organizationId:orgB,name:"Other School",
      code:(tag+"B").toUpperCase(),subdomain:tag+"b"}})).id;
    for(const id of [actor,teacher,other,stuUser]){
      await db.user.create({data:{id,name:id,email:id+"@example.test"}});
    }
    profileId=(await db.userProfile.create({data:{userId:stuUser,
      firstName:"Synthetic",lastName:"Pupil"}})).id;
    const year=await db.academicYear.create({data:{schoolId,name:"2026/27",
      startDate:new Date("2026-01-01"),endDate:new Date("2026-12-31"),isCurrent:true}});
    const term=await db.term.create({data:{academicYearId:year.id,
      name:"Term 1",termNumber:1,startDate:new Date("2026-09-01"),
      endDate:new Date("2026-12-18"),isCurrent:true}});
    classId=(await db.class.create({data:{schoolId,academicYearId:year.id,
      name:"Synthetic JHS 3",level:"JHS3",isGraduatingClass:true}})).id;
    const subject=await db.subject.create({data:{schoolId,name:"Science",code:tag+"SCI"}});
    await db.classSubject.create({data:{classId,subjectId:subject.id}});
    studentId=(await db.student.create({data:{
      schoolId,studentId:tag+"-stu",classId,profileId}})).id;
    await db.enrollment.create({data:{
      studentId,classId,academicYearId:year.id,termId:term.id,status:"ACTIVE",
    }});
    const assignments={teacherId:"synthetic",classTeacherClassIds:[],
      subjectAssignments:[{classId,subjectId:subject.id}]};
    service=new InternalExamsService({client:db} as never,{
      getAssignments:async (_school:string,user:string)=>
        user===teacher?assignments:{teacherId:null,classTeacherClassIds:[],
          subjectAssignments:[]},
    } as never);
  });
  afterAll(async()=>{
    if(!db)return;
    try{
      await db.auditLog.deleteMany({where:{schoolId}});
      if(schoolId)await db.school.delete({where:{id:schoolId}}).catch(()=>undefined);
      if(schoolB)await db.school.delete({where:{id:schoolB}}).catch(()=>undefined);
      await db.organization.deleteMany({where:{id:{in:[orgA,orgB]}}});
      if(profileId)await db.userProfile.delete({where:{id:profileId}}).catch(()=>undefined);
      await db.user.deleteMany({where:{id:{in:[actor,teacher,other,stuUser]}}});
    }finally{await db.$disconnect()}
  });
  it("creates Mock 1 and Mock 2 with separate frozen rosters and subject papers",async()=>{
    const first=await service.create(schoolId,actor,"admin",classId);
    const second=await service.create(schoolId,actor,"admin",classId);
    expect([first.name,second.name]).toEqual(["Mock 1","Mock 2"]);
    expect(first._count).toMatchObject({candidates:1,papers:1});
    expect(second._count).toMatchObject({candidates:1,papers:1});
    sessionId=first.id;
    const p=await db.internalExamPaper.findFirstOrThrow({where:{sessionId:first.id}});
    paperId=p.id;
    await expect(service.create(schoolB,actor,"admin",classId)).rejects.toThrow();
    expect(await service.list(schoolB,actor,"admin")).toEqual([]);
    await expect(service.sheet(schoolB,actor,"admin",paperId)).rejects.toThrow(/not found/i);
  });
  it("refuses unauthorised marking and locks mark entry until opened",async()=>{
    const roster=await db.internalExamCandidate.findFirstOrThrow({where:{sessionId}});
    const body={paperId,entries:[{candidateId:roster.id,status:"MARKED" as const,
      marks:84,expectedVersion:0}]};
    await expect(service.save(schoolId,other,"teacher",body)).rejects.toThrow(/assigned/i);
    await expect(service.save(schoolId,teacher,"teacher",body)).rejects.toThrow(/locked/i);
    await service.open(schoolId,actor,"headteacher",sessionId);
    await service.save(schoolId,teacher,"teacher",body);
    await expect(service.save(schoolId,teacher,"teacher",body)).rejects.toThrow(/changed/i);
    const mark=await db.internalExamMark.findFirstOrThrow({where:{paperId}});
    expect(Number(mark.marks)).toBe(84);
    expect(await db.auditLog.count({where:{schoolId,entityType:"INTERNAL_MOCK_MARK"}})).toBe(1);
  });
  it("locks finished subject paper and entire session without changing termly scores",async()=>{
    await service.finalizePaper(schoolId,teacher,"teacher",paperId);
    await service.lock(schoolId,actor,"admin",sessionId);
    const exam=await db.internalExamSession.findUniqueOrThrow({where:{id:sessionId}});
    expect(exam.status).toBe("LOCKED");
    expect(await db.assessmentScore.count({where:{studentId}})).toBe(0);
    const candidate=await db.internalExamCandidate.findFirstOrThrow({where:{sessionId}});
    await expect(service.save(schoolId,teacher,"teacher",{paperId,entries:[{
      candidateId:candidate.id,status:"MARKED",marks:90,expectedVersion:1,
    }]})).rejects.toThrow(/locked/i);
  });
});
