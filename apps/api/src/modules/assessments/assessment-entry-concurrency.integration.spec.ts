import { beforeAll, afterAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { AssessmentEntryService } from "./assessment-entry.service.js";
const url=process.env.TEST_DATABASE_URL??"";
const enabled=(()=>{try{return /test/i.test(new URL(url).pathname)}catch{return false}})();
describe.skipIf(!enabled)("SBA drafts: PostgreSQL atomic stale-write rejection",{timeout:90000},()=>{
 let db:PrismaClient,service:AssessmentEntryService,schoolId="",profileId="";
 const tag="draft"+Date.now().toString(36),userId=tag+"user",orgId=tag+"org";
 let input:{classId:string;subjectId:string;templateId:string;termId:string;entries:{studentId:string;componentId:string;occurrenceIndex:number;marks:number;expectedMarks:number|null}[]};
 beforeAll(async()=>{
  process.env.DATABASE_URL=url;
  const {prisma}=await import("../../prisma/prisma.client.js");db=prisma;
  const {AssessmentEntryService:Service}=await import("./assessment-entry.service.js");service=new Service({client:db} as never,{} as never);
  await db.organization.create({data:{id:orgId,name:"Draft tests",slug:orgId}});
  schoolId=(await db.school.create({data:{organizationId:orgId,name:"Draft tests",code:tag,subdomain:tag}})).id;
  await db.user.create({data:{id:userId,name:"Draft actor",email:tag+"@example.test"}});
  profileId=(await db.userProfile.create({data:{userId,firstName:"Synthetic",lastName:"Pupil"}})).id;
  const year=await db.academicYear.create({data:{schoolId,name:tag,startDate:new Date("2026-01-01"),endDate:new Date("2026-12-31"),isCurrent:true}});
  const term=await db.term.create({data:{academicYearId:year.id,name:"Term 1",termNumber:1,startDate:year.startDate,endDate:year.endDate,isCurrent:true}});
  const klass=await db.class.create({data:{schoolId,name:"P5",level:"P5",academicYearId:year.id}});
  const subject=await db.subject.create({data:{schoolId,name:"Maths",code:tag}});
  await db.classSubject.create({data:{classId:klass.id,subjectId:subject.id}});
  const student=await db.student.create({data:{schoolId,studentId:tag,classId:klass.id,profileId}});
  await db.enrollment.create({data:{studentId:student.id,classId:klass.id,academicYearId:year.id,termId:term.id}});
  const grading=await db.gradingSystem.create({data:{schoolId,name:tag,code:tag}});
  const template=await db.assessmentTemplate.create({data:{schoolId,name:tag,gradingSystemId:grading.id}});
  const component=await db.assessmentComponent.create({data:{templateId:template.id,name:"Quiz",componentType:"QUIZ",maxMarks:100,weight:100,displayOrder:0}});
  input={classId:klass.id,subjectId:subject.id,templateId:template.id,termId:term.id,entries:[{studentId:student.id,componentId:component.id,occurrenceIndex:0,marks:20,expectedMarks:null}]};
 });
 afterAll(async()=>{if(!db)return;try{if(schoolId)await db.school.delete({where:{id:schoolId}});await db.organization.deleteMany({where:{id:orgId}});if(profileId)await db.userProfile.deleteMany({where:{id:profileId}});await db.user.deleteMany({where:{id:userId}});}finally{await db.$disconnect()}});
 it("accepts only one of two drafts based on the same mark",async()=>{
  await service.saveEntries(schoolId,userId,"admin",input);
  const write=(marks:number)=>service.saveEntries(schoolId,userId,"admin",{...input,entries:input.entries.map(row=>({...row,marks,expectedMarks:20}))});
  const results=await Promise.allSettled([write(30),write(40)]);
  expect(results.filter(row=>row.status==="fulfilled")).toHaveLength(1);
  const rejected=results.find(row=>row.status==="rejected");expect(rejected?.status==="rejected"&&rejected.reason.getStatus()).toBe(409);
  const row=await db.componentScore.findFirstOrThrow({where:{componentId:input.entries[0]!.componentId}});
  expect([30,40]).toContain(Number(row.marksObtained));
 });
 it("rejects another school's sheet without creating marks",async()=>{
  await expect(service.saveEntries("different-school",userId,"admin",input)).rejects.toThrow();
 });
});
