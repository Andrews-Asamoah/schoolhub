import { describe,expect,it } from "vitest";
import { mockMarkSchema } from "./internal-exams.schemas.js";
import { assignedPaperFilter,mockPercent,validateMockMarks } from "./internal-exams.js";
describe("internal mock marks",()=>{
  it("distinguishes an explicit absence from an actual score of zero",()=>{
    expect(()=>validateMockMarks(100,[{status:"ABSENT",marks:null},{status:"MARKED",marks:0}])).not.toThrow();
    expect(()=>validateMockMarks(100,[{status:"ABSENT",marks:0}])).toThrow(/absent/i);
    expect(mockPercent(null,100)).toBeNull();
    expect(mockPercent(0,100)).toBe(0);
  });
  it("denies out-of-range and overprecision",()=>{
    expect(()=>validateMockMarks(80,[{status:"MARKED",marks:90}])).toThrow();
    expect(()=>validateMockMarks(100,[{status:"MARKED",marks:44.123}])).toThrow();
    expect(()=>validateMockMarks(100,[{status:"MARKED",marks:0.29}])).not.toThrow();
  });
  it("requires optimistic versions, valid statuses and unique candidates",()=>{
    expect(mockMarkSchema.safeParse({paperId:"p",entries:[{
      candidateId:"a",status:"MARKED",marks:89.5,expectedVersion:0,
    }]}).success).toBe(true);
    expect(mockMarkSchema.safeParse({paperId:"p",entries:[{
      candidateId:"a",status:"MARKED",marks:89.5,expectedVersion:0,
    },{candidateId:"a",status:"ABSENT",marks:null,expectedVersion:0}]}).success).toBe(false);
    expect(mockMarkSchema.safeParse({paperId:"p",entries:[{
      candidateId:"a",status:"ABSENT",marks:0,expectedVersion:0,
    }]}).success).toBe(false);
  });
});

describe("assigned subject papers",()=>{
  it("selects the subjects a teacher teaches whole or by teaching area, grouped per class",()=>{
    const filter=assignedPaperFilter({
      subjectAssignments:[{classId:"c1",subjectId:"math"},{classId:"c1",subjectId:"eng"}],
      subjectStrandAssignments:[
        {classId:"c1",subjectId:"ict",subjectStrandId:"hw"},
        {classId:"c1",subjectId:"ict",subjectStrandId:"sw"},
        {classId:"c2",subjectId:"math",subjectStrandId:"x"},
      ],
    });
    expect(filter).toEqual({OR:[
      {session:{classId:"c1"},subjectId:{in:["math","eng","ict"]}},
      {session:{classId:"c2"},subjectId:{in:["math"]}},
    ]});
  });
  it("matches nothing for a teacher without a subject assignment",()=>{
    expect(assignedPaperFilter({subjectAssignments:[],subjectStrandAssignments:[]})).toEqual({OR:[]});
  });
});
