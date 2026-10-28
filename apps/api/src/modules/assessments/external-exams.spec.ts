import {describe,it,expect} from "vitest";
import {resultSummary,validateBECEResult} from "./external-exams.js";
import {externalResultBatchSchema} from "./external-exams.schemas.js";
describe("staff-entered BECE result guards",()=>{
  it("rejects invalid grades and preserves non-grade statuses",()=>{
    expect(()=>validateBECEResult({status:"GRADED",grade:1})).not.toThrow();
    expect(()=>validateBECEResult({status:"GRADED",grade:0})).toThrow();
    expect(()=>validateBECEResult({status:"GRADED",grade:9.5})).toThrow();
    expect(()=>validateBECEResult({status:"WITHHELD",grade:2})).toThrow();
    expect(()=>validateBECEResult({status:"ABSENT",grade:null})).not.toThrow();
  });
  it("computes grade distributions without inventing BECE aggregate/pass scores",()=>{
    const result=resultSummary([{status:"GRADED",grade:1},{status:"GRADED",grade:9},
      {status:"WITHHELD",grade:null},{status:"ABSENT",grade:null}],6);
    expect(result).toMatchObject({expected:6,recorded:4,pending:2,
      statuses:{GRADED:2,WITHHELD:1,ABSENT:1,CANCELLED:0}});
    expect(result.grades.find(x=>x.grade===1)?.count).toBe(1);
    expect("aggregate" in result).toBe(false);
    expect("passRate" in result).toBe(false);
  });
  it("requires evidence references, optimistic versions, unique roster candidates",()=>{
    const payload={paperId:"p",sourceReference:"WAEC school statement",entries:[{
      candidateId:"student1",status:"GRADED",grade:5,expectedVersion:0,
    }]};
    expect(externalResultBatchSchema.safeParse(payload).success).toBe(true);
    expect(externalResultBatchSchema.safeParse({...payload,entries:[
      ...payload.entries,...payload.entries,
    ]}).success).toBe(false);
    expect(externalResultBatchSchema.safeParse({...payload,entries:[{
      candidateId:"student1",status:"ABSENT",grade:5,expectedVersion:0,
    }]}).success).toBe(false);
  });
});
