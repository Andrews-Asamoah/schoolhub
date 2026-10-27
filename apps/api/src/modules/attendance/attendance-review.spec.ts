import { describe, expect, it } from "vitest";
import { classRegisterGaps } from "./attendance-review.js";

describe("class-level register completeness", () => {
  const dates = ["2026-10-26","2026-10-27","2026-10-28"];
  it("does not count missing registers as absences or skip partially saved days", () => {
    expect(classRegisterGaps({
      dates,
      enrollments: [
        { studentId:"a", start:"2026-10-26",end:"2026-10-28" },
        { studentId:"b", start:"2026-10-26",end:"2026-10-28" },
      ],
      marks: [{studentId:"a",date:dates[0]!},{studentId:"b",date:dates[0]!},
        {studentId:"a",date:dates[1]!}],
      exclusions:[],
    })).toMatchObject({
      expectedMarks:6, recordedMarks:3, missingMarks:3, incompleteDays:2,
      days:[{date:"2026-10-27",expected:2,marked:1,missing:1},
        {date:"2026-10-28",expected:2,marked:0,missing:2}],
    });
  });
  it("honours effective dates and individual exclusions", () => {
    const result=classRegisterGaps({
      dates,
      enrollments:[
        {studentId:"a",start:"2026-10-26",end:"2026-10-28"},
        {studentId:"b",start:"2026-10-28",end:"2026-10-28"},
      ],
      marks:[{studentId:"a",date:dates[0]!},{studentId:"a",date:dates[2]!}],
      exclusions:[{studentId:"a",date:dates[1]!},{studentId:"b",date:dates[2]!}],
    });
    expect(result).toMatchObject({expectedMarks:2,recordedMarks:2,missingMarks:0,
      incompleteDays:0,days:[],coverageRate:100});
  });
  it("ignores days without eligible students", () => {
    const out=classRegisterGaps({dates, enrollments:[], marks:[],exclusions:[]});
    expect(out).toMatchObject({incompleteDays:0,expectedMarks:0,coverageRate:null});
  });
  it("rejects duplicate calendar dates", () => {
    expect(()=>classRegisterGaps({dates:["2026-10-26","2026-10-26"],
      enrollments:[],marks:[],exclusions:[]})).toThrow(/duplicate/i);
  });
});
