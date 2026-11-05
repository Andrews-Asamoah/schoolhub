import { describe, expect, it, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import { AssessmentEntryService } from "./assessment-entry.service.js";

function fixture() {
  const tx = { $executeRaw:vi.fn(), assessmentScore:{findUnique:vi.fn().mockResolvedValue({id:"score",isLocked:false})},
    componentScore:{findUnique:vi.fn().mockResolvedValue({marksObtained:25}),upsert:vi.fn()} };
  const service = new AssessmentEntryService({client:{$transaction: async (fn:(tx:unknown)=>unknown)=>fn(tx)}} as never, {} as never);
  Object.assign(service, { loadContext:async()=>({klass:{id:"class"},subject:{id:"subject"},term:{id:"term"},assignments:{},
    templates:[{id:"template",components:[{id:"component",maxMarks:100,weight:100,slots:1,isRequired:true,subjectStrandId:null}]}]}),
    loadRoster:async()=>[{id:"student"}] });
  const input={classId:"class",subjectId:"subject",templateId:"template",termId:"term",entries:[{studentId:"student",componentId:"component",occurrenceIndex:0,marks:40,expectedMarks:20}]};
  return {service,tx,input};
}
describe("assessment draft concurrency",()=>{
 it("rejects a changed server mark without writing the stale draft",async()=>{
   const {service,tx,input}=fixture();await expect(service.saveEntries("school","actor","admin",input)).rejects.toBeInstanceOf(ConflictException);
   expect(tx.componentScore.upsert).not.toHaveBeenCalled();expect(tx.$executeRaw).toHaveBeenCalled();
 });
 it("rejects a draft from a different academic term",async()=>{
   const {service,tx,input}=fixture();await expect(service.saveEntries("school","actor","admin",{...input,termId:"old-term"})).rejects.toBeInstanceOf(ConflictException);
   expect(tx.assessmentScore.findUnique).not.toHaveBeenCalled();
 });
});
