/**
 * Database-backed rollout regression: only runs with a dedicated TEST_DATABASE_URL.
 * No real student information is stored or used.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { AttendanceCalendarService as CalendarType } from "./attendance-calendar.service.js";
import type { AttendanceService as AttendanceType } from "./attendance.service.js";

const url = process.env.TEST_DATABASE_URL ?? "";
const enabled = (() => {
  try { return /test/i.test(new URL(url).pathname); } catch { return false; }
})();
const D = (date: Date) => date.toISOString().slice(0, 10);
const offset = (days: number) => new Date(Date.now() + days * 86400000);

describe.skipIf(!enabled)("attendance activation: PostgreSQL tenant and audit regression", { timeout:60_000 }, () => {
  let db: PrismaClient;
  let calendar: CalendarType;
  let attendance: AttendanceType;
  const id = "ap" + Date.now().toString(36);
  let a = "", b = "", yearId = "", termId = "", studentId = "", actor = "", profileId = "";
  const schoolA = id + "-orgA", schoolB = id + "-orgB";
  const activeDate = D(new Date());

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    const { prisma } = await import("../../prisma/prisma.client.js");
    const { AttendanceCalendarService } = await import("./attendance-calendar.service.js");
    const { AttendanceService } = await import("./attendance.service.js");
    db = prisma;
    calendar = new AttendanceCalendarService({ client: db } as never);
    attendance = new AttendanceService({ client: db } as never, {} as never, calendar);

    await db.organization.create({ data:{ id:schoolA, name:"Synthetic A", slug:schoolA } });
    await db.organization.create({ data:{ id:schoolB, name:"Synthetic B", slug:schoolB } });
    a = (await db.school.create({ data:{ organizationId:schoolA,name:"School A",code:(id+"A").toUpperCase(),subdomain:id+"-a" } })).id;
    b = (await db.school.create({ data:{ organizationId:schoolB,name:"School B",code:(id+"B").toUpperCase(),subdomain:id+"-b" } })).id;
    actor = id + "-actor";
    await db.user.create({ data:{id:actor,name:"Synthetic Admin",email:id+"-actor@example.test"} });
    const studentUser = await db.user.create({ data:{id:id+"-user",name:"Synthetic Student",email:id+"-user@example.test"} });
    const profile = await db.userProfile.create({ data:{userId:studentUser.id,firstName:"Synthetic",lastName:"Student"} });
    profileId = profile.id;
    yearId = (await db.academicYear.create({ data:{schoolId:a,name:id+" Year",startDate:offset(-20),endDate:offset(20),isCurrent:true} })).id;
    termId = (await db.term.create({ data:{academicYearId:yearId,name:"Term 1",termNumber:1,
      startDate:offset(-5),endDate:offset(5),isCurrent:true,instructionalWeekdays:[1,2,3,4,5,6,7]} })).id;
    const classroom = await db.class.create({ data:{schoolId:a,academicYearId:yearId,name:"Synthetic Class",level:"JHS1"} });
    studentId = (await db.student.create({ data:{schoolId:a,studentId:id+"-stu",profileId, classId:classroom.id,
      admissionDate:offset(-5)} })).id;
    await db.enrollment.create({data:{studentId,classId:classroom.id,academicYearId:yearId,termId,status:"ACTIVE"}});
    await db.attendance.create({ data:{studentId,date:offset(-1),status:"PRESENT"} });
  });

  afterAll(async () => {
    if (!db) return;
    try {
      await db.auditLog.deleteMany({where:{schoolId:{in:[a,b]}}});
      await db.school.deleteMany({where:{id:{in:[a,b]}}});
      await db.organization.deleteMany({where:{id:{in:[schoolA,schoolB]}}});
      await db.userProfile.deleteMany({where:{id:profileId}});
      await db.user.deleteMany({where:{id:{in:[actor,id+"-user"]}}});
    } finally { await db.$disconnect(); }
  });

  it("defaults OFF and retains original recorded-days attendance results", async () => {
    expect((await calendar.getPolicy(a)).attendancePolicyActiveFrom).toBeNull();
    const oldResult = await attendance.getStudentAttendanceSummary(a,studentId,"admin",yearId,termId);
    expect(oldResult).toMatchObject({
      attendanceRate:100, totalDays:1, recordedDays:1,
      policyMode:"LEGACY_RECORDED", coverageRate:null,
    });
  });

  it("rejects term and calendar identifiers belonging to another school", async () => {
    await expect(calendar.getCalendar(b,termId)).rejects.toThrow(/not found/i);
    await expect(attendance.getStudentAttendanceSummary(b,studentId,"admin",yearId,termId))
      .rejects.toThrow(/belonging|current|not found/i);
  });

  it("activates the calendar with audit and preserves preceding recorded marks", async () => {
    const first=await calendar.setPolicy(a,actor,{
      attendancePolicyActiveFrom:activeDate,reason:"Approved new attendance method",
    });
    expect(first.changed).toBe(true);
    const again=await calendar.setPolicy(a,actor,{
      attendancePolicyActiveFrom:activeDate,reason:"No additional change required",
    });
    expect(again.changed).toBe(false);
    expect(await db.auditLog.count({where:{schoolId:a,entityType:"ATTENDANCE_POLICY"}})).toBe(1);
    const result=await attendance.getStudentAttendanceSummary(a,studentId,"admin",yearId,termId);
    expect(result).toMatchObject({
      attendanceRate:null,provisionalRate:100,recordedDays:1,
      possibleDays:2,unmarkedDays:1,coverageRate:50,policyMode:"TRANSITION",
    });
  });
});
