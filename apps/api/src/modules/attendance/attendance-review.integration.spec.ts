/**
 * PostgreSQL integration tests for attendance review, tenant isolation and concurrent writes.
 * Never runs against production; requires TEST_DATABASE_URL with 'test' in database name.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { AttendanceReviewService as ReviewType } from "./attendance-review.service.js";
import type { AttendanceCalendarService as CalendarType } from "./attendance-calendar.service.js";
import type { AttendanceService as AttendanceType } from "./attendance.service.js";

const url=process.env.TEST_DATABASE_URL??"";
const enabled=(()=>{try{return /test/i.test(new URL(url).pathname);}catch{return false;}})();
const shift=(days:number)=>new Date(Date.now()+days*86400000);
const day=(d:Date)=>d.toISOString().slice(0,10);

describe.skipIf(!enabled)("attendance register review / concurrency (PostgreSQL)",{timeout:90000},()=>{
  let db:PrismaClient, review:ReviewType, calendar:CalendarType, attendance:AttendanceType;
  const tag="arv"+Date.now().toString(36);
  const orgA=tag+"-A",orgB=tag+"-B";
  const userAdmin=tag+"-admin",teacherUser=tag+"-teacher",userStudent=tag+"-student";
  let schoolA="",schoolB="",classId="",studentId="",yearId="",termId="",profileId="";
  const dateToday=day(new Date()), datePrior=day(shift(-1)),dateEarlier=day(shift(-2));

  beforeAll(async()=>{
    process.env.DATABASE_URL=url;
    const {prisma}=await import("../../prisma/prisma.client.js");db=prisma;
    const {AttendanceReviewService}=await import("./attendance-review.service.js");
    const {AttendanceCalendarService}=await import("./attendance-calendar.service.js");
    const {AttendanceService}=await import("./attendance.service.js");
    calendar=new AttendanceCalendarService({client:db} as never);
    const scope={
      getTaughtClassIds:async (_school:string,user:string)=>user===teacherUser?[classId]:[],
      getAssignments:async()=>({teacherId:teacherUser,classTeacherClassIds:[classId],subjectAssignments:[]}),
    };
    review=new AttendanceReviewService({client:db} as never,scope as never,calendar);
    attendance=new AttendanceService({client:db} as never,scope as never,calendar);
    await db.organization.create({data:{id:orgA,name:"Synthetic A",slug:orgA}});
    await db.organization.create({data:{id:orgB,name:"Synthetic B",slug:orgB}});
    schoolA=(await db.school.create({data:{organizationId:orgA,name:tag+" A",
      code:(tag+"A").toUpperCase(),subdomain:tag+"a"}})).id;
    schoolB=(await db.school.create({data:{organizationId:orgB,name:tag+" B",
      code:(tag+"B").toUpperCase(),subdomain:tag+"b"}})).id;
    // School B needs its own active term so denial exercises class tenant scoping,
    // rather than short-circuiting on a missing academic context.
    const otherYear=await db.academicYear.create({data:{schoolId:schoolB,
      name:tag+" Other Year",startDate:shift(-15),endDate:shift(20),isCurrent:true}});
    await db.term.create({data:{academicYearId:otherYear.id,name:"Term 1",termNumber:1,
      startDate:shift(-2),endDate:shift(7),isCurrent:true,instructionalWeekdays:[1,2,3,4,5,6,7]}});
    await db.user.create({data:{id:userAdmin,name:"Synthetic Admin",email:userAdmin+"@example.test"}});
    await db.user.create({data:{id:teacherUser,name:"Synthetic Teacher",email:teacherUser+"@example.test"}});
    await db.user.create({data:{id:userStudent,name:"Synthetic Pupil",email:userStudent+"@example.test"}});
    profileId=(await db.userProfile.create({data:{userId:userStudent,firstName:"Synthetic",lastName:"Pupil"}})).id;
    yearId=(await db.academicYear.create({data:{schoolId:schoolA,name:tag+" Year",
      startDate:shift(-15),endDate:shift(20),isCurrent:true}})).id;
    termId=(await db.term.create({data:{academicYearId:yearId,name:"Term 1",termNumber:1,
      startDate:shift(-2),endDate:shift(7),isCurrent:true,instructionalWeekdays:[1,2,3,4,5,6,7]}})).id;
    classId=(await db.class.create({data:{schoolId:schoolA,academicYearId:yearId,name:tag+" Class",level:"JHS3"}})).id;
    studentId=(await db.student.create({data:{schoolId:schoolA,studentId:tag+"-stu",
      profileId,admissionDate:shift(-2),classId}})).id;
    await db.enrollment.create({data:{studentId,classId,academicYearId:yearId,termId,status:"ACTIVE"}});
  });

  afterAll(async()=>{
    if(!db)return;
    try{
      if(schoolA)await db.auditLog.deleteMany({where:{schoolId:schoolA}});
      if(schoolA)await db.school.delete({where:{id:schoolA}}).catch(()=>undefined);
      if(schoolB)await db.school.delete({where:{id:schoolB}}).catch(()=>undefined);
      await db.organization.deleteMany({where:{id:{in:[orgA,orgB]}}});
      if(profileId)await db.userProfile.delete({where:{id:profileId}}).catch(()=>undefined);
      await db.user.deleteMany({where:{id:{in:[userAdmin,teacherUser,userStudent]}}});
    }finally{await db.$disconnect();}
  });

  it("shows missing registers without creating absence marks",async()=>{
    const reviewResult=await review.classGaps(schoolA,classId,"admin",userAdmin);
    expect(reviewResult).toMatchObject({
      policyMode:"PREVIEW",expectedMarks:3,recordedMarks:0,
      missingMarks:3,incompleteDays:3,
    });
    expect(await db.attendance.count({where:{studentId}})).toBe(0);
  });

  it("denies cross-school class discovery and unauthorised teachers",async()=>{
    await expect(review.classGaps(schoolB,classId,"admin",userAdmin)).rejects.toThrow(/not found/i);
    await expect(review.classGaps(schoolA,classId,"teacher","outsider")).rejects.toThrow(/do not teach/i);
    const allowed=await review.classGaps(schoolA,classId,"teacher",teacherUser);
    expect(allowed.class.id).toBe(classId);
    await expect(calendar.listClassExclusions(schoolB,termId,classId)).rejects.toThrow(/not found/i);
  });

  it("approves and revokes student-specific exclusions with audit history",async()=>{
    const row=await calendar.approveExclusion(schoolA,userAdmin,{
      studentId,termId,date:datePrior,reason:"School-authorised non-attendance obligation",
    });
    expect((await review.classGaps(schoolA,classId,"admin",userAdmin)).missingMarks).toBe(2);
    expect((await calendar.listClassExclusions(schoolA,termId,classId)).map(x=>x.id)).toContain(row.id);
    await calendar.revokeExclusion(schoolA,userAdmin,row.id,"Administrative approval withdrawn after verification");
    expect((await review.classGaps(schoolA,classId,"admin",userAdmin)).missingMarks).toBe(3);
    expect(await db.auditLog.count({where:{schoolId:schoolA,entityType:"ATTENDANCE_EXCLUSION"}})).toBe(2);
  });

  it("refuses to turn a recorded school day into a holiday by calendar replacement",async()=>{
    await attendance.batchRecordAttendance(schoolA,teacherUser,{date:dateEarlier,
      records:[{studentId,status:"PRESENT"}]},"teacher");
    const cal=await calendar.getCalendar(schoolA,termId);
    await expect(calendar.replaceCalendar(schoolA,userAdmin,termId,{
      weekdays:[1,2,3,4,5,6,7],reason:"Incorrectly proposed as school holiday",
      overrides:[{date:dateEarlier,isInstructional:false,label:"Invalid closure"}],
    })).rejects.toThrow(/attendance has already been entered/i);
    expect((await calendar.getCalendar(schoolA,termId)).term.calendarRevision).toBe(cal.term.calendarRevision);
    expect(await db.attendance.count({where:{studentId,date:new Date(dateEarlier+"T00:00:00.000Z")}})).toBe(1);
  });

  it("serialises a class teacher mark against school-wide closure (at most one succeeds)",async()=>{
    const policy=await calendar.getCalendar(schoolA,termId);
    const result=await Promise.allSettled([
      attendance.batchRecordAttendance(schoolA,teacherUser,
        {date:dateToday,records:[{studentId,status:"PRESENT"}]},"teacher"),
      calendar.declareSchoolClosure(schoolA,userAdmin,termId,{
        date:dateToday,label:"Unexpected school closure",
        reason:"Cancelled lessons for all school classes",
        expectedRevision:policy.term.calendarRevision,
      }),
    ]);
    const won=result.filter(x=>x.status==="fulfilled");
    expect(won).toHaveLength(1);
    const mark=await db.attendance.findUnique({
      where:{studentId_date:{studentId,date:new Date(dateToday+"T00:00:00.000Z")}},
    });
    const closure=await db.academicCalendarDay.findUnique({
      where:{schoolId_termId_date:{schoolId:schoolA,termId,date:new Date(dateToday+"T00:00:00.000Z")}},
    });
    expect(Boolean(mark)).not.toBe(Boolean(closure && !closure.isInstructional));
    expect((await calendar.getCalendar(schoolA,termId)).term.calendarRevision)
      .toBe(policy.term.calendarRevision+(closure?1:0));
  });
});
