import { describe, expect, it } from "vitest";
import { calculateDailyAttendance, eligibleInstructionalDates, requireWeekdays } from "./attendance-calendar.js";

const params = { start: "2026-10-26", end: "2026-10-30", asOf: "2026-10-30", weekdays: [1,2,3,4,5] };

describe("instructional calendar and daily attendance", () => {
  it("rejects duplicate or invalid weekday policies", () => {
    expect(() => requireWeekdays([1,1])).toThrow();
    expect(() => requireWeekdays([0,1])).toThrow();
    expect(() => requireWeekdays([])).toThrow();
    expect(() => eligibleInstructionalDates({ ...params, overrides: [{date:"2026-10-29",isInstructional:false},{date:"2026-10-29",isInstructional:false}] })).toThrow();
  });
  it("honours holidays, approved exclusions and weekend make-up days exactly once", () => {
    expect(eligibleInstructionalDates({
      ...params, end:"2026-10-31", asOf:"2026-10-31",
      overrides:[{ date:"2026-10-27",isInstructional:false },{ date:"2026-10-31",isInstructional:true }],
      excludedDates:["2026-10-28","2026-10-28","2026-10-27"]
    })).toEqual(["2026-10-26","2026-10-29","2026-10-30","2026-10-31"]);
  });
  it("never treats an unmarked register as an absence or complete percentage", () => {
    const result=calculateDailyAttendance({ ...params, records:[{date:"2026-10-26",status:"PRESENT"},{date:"2026-10-27",status:"LATE"}] });
    expect(result.possibleDays).toBe(5);
    expect(result.summary.ABSENT).toBe(0);
    expect(result.unmarkedDays).toBe(3);
    expect(result.attendanceRate).toBeNull();
    expect(result.coverageRate).toBe(40);
  });
  it("counts excused absences in the denominator unless explicitly excluded", () => {
    const records=["PRESENT","LATE","ABSENT","EXCUSED","SICK"] as const;
    const result=calculateDailyAttendance({...params, records:records.map((status,i)=>({date:"2026-10-"+String(26+i),status}))});
    expect(result.possibleDays).toBe(5);
    expect(result.attendanceRate).toBe(40);
    expect(result.summary.EXCUSED).toBe(1);
  });
  it("does not count records on holiday as instructional attendance", () => {
    const result=calculateDailyAttendance({ ...params,
      overrides:[{date:"2026-10-27",isInstructional:false}],
      records:[{date:"2026-10-27",status:"PRESENT"}] });
    expect(result.ignoredRecords).toBe(1);
    expect(result.daysAttended).toBe(0);
    expect(result.unmarkedDays).toBe(4);
  });
  it("never counts dates after the as-of date", () => {
    const result=calculateDailyAttendance({...params, asOf:"2026-10-27", records:[]});
    expect(result.possibleDays).toBe(2);
  });
  it("returns an explicit no-data result rather than 0% on zero eligible days", () => {
    const result=calculateDailyAttendance({...params,start:"2026-10-31",end:"2026-10-31",asOf:"2026-10-31",records:[]});
    expect(result.attendanceRate).toBeNull();
    expect(result.possibleDays).toBe(0);
  });
});
