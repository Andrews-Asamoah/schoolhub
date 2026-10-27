import { describe, expect, it, vi } from "vitest";
import { NotFoundException } from "@nestjs/common";
import type { PrismaService } from "../../prisma/prisma.service.js";
import { AttendanceCalendarService } from "./attendance-calendar.service.js";
import { attendanceExclusionSchema, calendarConfigurationSchema } from "./attendance-calendar.schemas.js";

describe("attendance calendar input validation", () => {
  it("requires a documented reason for calendar changes", () => {
    expect(calendarConfigurationSchema.safeParse({
      weekdays:[1,2,3,4,5], overrides:[], reason:""
    }).success).toBe(false);
  });
  it("rejects malformed day overrides and non-ISO dates", () => {
    expect(calendarConfigurationSchema.safeParse({
      weekdays:[1,2,3,4,5],
      reason:"National holiday addition",
      overrides:[{date:"29/10/2026",isInstructional:false,label:"Holiday"}],
    }).success).toBe(false);
  });
  it("requires an approved student exclusion reason and a term", () => {
    expect(attendanceExclusionSchema.safeParse({
      studentId:"stu-1",termId:"",date:"2026-10-28",reason:"Approved medical leave",
    }).success).toBe(false);
  });
});

describe("tenant boundary on academic calendar read", () => {
  it("never loads a term without verifying its academic year's school", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new AttendanceCalendarService({ client: { term: { findFirst } } } as unknown as PrismaService);
    await expect(service.getCalendar("school-A","term-B")).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where:{ id:"term-B", academicYear: { schoolId:"school-A" } },
    }));
  });
});
