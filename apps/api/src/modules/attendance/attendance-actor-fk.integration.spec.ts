/** Database-backed FK guard for new attendance actor references (synthetic fixtures only). */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
const url=process.env.TEST_DATABASE_URL ?? "";
const enabled=(()=>{try{return /test/i.test(new URL(url).pathname);}catch{return false;}})();
describe.skipIf(!enabled)("attendance actor FK constraints (PostgreSQL)", { timeout:60_000 },()=>{
  let db:PrismaClient;
  const tag="afk"+Date.now().toString(36);
  let schoolId="", yearId="", termId="", studentId="", creatorId="", profileId="";
  const orgId=tag+"-org",studentUserId=tag+"-student";
  beforeAll(async()=>{
    process.env.DATABASE_URL=url;
    const {prisma}=await import("../../prisma/prisma.client.js");db=prisma;
    await db.organization.create({data:{id:orgId,name:tag,slug:orgId}});
    schoolId=(await db.school.create({data:{organizationId:orgId,name:tag,subdomain:tag,code:tag.toUpperCase()}})).id;
    creatorId=tag+"-actor";
    await db.user.create({data:{id:creatorId,name:"Synthetic Creator",email:creatorId+"@example.test"}});
    await db.user.create({data:{id:studentUserId,name:"Synthetic Pupil",email:studentUserId+"@example.test"}});
    profileId=(await db.userProfile.create({data:{userId:studentUserId,firstName:"Synthetic",lastName:"Pupil"}})).id;
    yearId=(await db.academicYear.create({data:{schoolId,name:tag,startDate:new Date("2026-01-01"),endDate:new Date("2026-12-31")}})).id;
    termId=(await db.term.create({data:{academicYearId:yearId,name:"Term 1",termNumber:1,startDate:new Date("2026-09-01"),endDate:new Date("2026-12-18")}})).id;
    const cl=(await db.class.create({data:{schoolId,academicYearId:yearId,name:tag,level:"JHS1"}})).id;
    studentId=(await db.student.create({data:{schoolId,studentId:tag,profileId,classId:cl}})).id;
  });
  afterAll(async()=>{
    if(!db)return;
    try{
      if(schoolId)await db.school.delete({where:{id:schoolId}}).catch(()=>undefined);
      await db.organization.delete({where:{id:orgId}}).catch(()=>undefined);
      await db.userProfile.delete({where:{id:profileId}}).catch(()=>undefined);
      await db.user.deleteMany({where:{id:{in:[creatorId,studentUserId]}}});
    }finally{await db.$disconnect();}
  });
  it("rejects invalid calendar and exclusion approver identities",async()=>{
    await expect(db.academicCalendarDay.create({data:{
      schoolId,termId,date:new Date("2026-09-21"),isInstructional:false,label:"Synthetic closure",createdById:"does-not-exist",
    }})).rejects.toThrow();
    await expect(db.studentAttendanceExclusion.create({data:{
      schoolId,studentId,termId,date:new Date("2026-09-22"),reason:"Synthetic approved exclusion",approvedById:"does-not-exist",
    }})).rejects.toThrow();
  });
  it("preserves the record but clears references when a staff account is deleted",async()=>{
    const day=await db.academicCalendarDay.create({data:{
      schoolId,termId,date:new Date("2026-09-21"),isInstructional:false,label:"Synthetic closure",createdById:creatorId,
    }});
    const exclusion=await db.studentAttendanceExclusion.create({data:{
      schoolId,studentId,termId,date:new Date("2026-09-22"),reason:"Synthetic approved exclusion",approvedById:creatorId,
    }});
    await db.user.delete({where:{id:creatorId}});
    expect((await db.academicCalendarDay.findUniqueOrThrow({where:{id:day.id}})).createdById).toBeNull();
    expect((await db.studentAttendanceExclusion.findUniqueOrThrow({where:{id:exclusion.id}})).approvedById).toBeNull();
  });
});