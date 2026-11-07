import {expect,it,vi} from "vitest";
import {PortalWorkQueueService} from "./portal-work-queue.service.js";
const term={id:"term",name:"Term 1",academicYearId:"year"};
it("denies roles without an academic queue before querying school data",async()=>{
 const findFirst=vi.fn();const service=new PortalWorkQueueService({client:{term:{findFirst}}} as never,{} as never);
 await expect(service.get("school","guardian","guardian")).rejects.toThrow(/no academic work queue/);expect(findFirst).not.toHaveBeenCalled();
});
it("scopes student assignments to the authenticated pupil and current enrollment",async()=>{
 const findMany=vi.fn().mockResolvedValue([{id:"task",title:"Homework",dueAt:null,submissions:[]}]);
 const student=vi.fn().mockResolvedValue({id:"pupil"}),enrollment=vi.fn().mockResolvedValue({classId:"class"});
 const service=new PortalWorkQueueService({client:{term:{findFirst:vi.fn().mockResolvedValue(term)},student:{findFirst:student},enrollment:{findFirst:enrollment},schoolAssignment:{findMany}}} as never,{} as never);
 const result=await service.get("school","user","student");
 expect(student).toHaveBeenCalledWith(expect.objectContaining({where:{schoolId:"school",deletedAt:null,profile:{userId:"user"}}}));
 expect(findMany).toHaveBeenCalledWith(expect.objectContaining({where:{schoolId:"school",termId:"term",classId:"class",status:"PUBLISHED"}}));
 expect(result.upcoming[0]?.status).toBe("TO_DO");expect(result.items[0]?.count).toBe(1);
});
it("uses assigned teaching areas and the actor's submissions for the teacher agenda",async()=>{
 const submissions=vi.fn().mockResolvedValue(3),lessons=vi.fn().mockResolvedValue([]);
 const getAssignments=vi.fn().mockResolvedValue({teacherId:"teacher",classTeacherClassIds:["class"],subjectAssignments:[{classId:"class",subjectId:"subject"}],subjectStrandAssignments:[]});
 const service=new PortalWorkQueueService({client:{term:{findFirst:vi.fn().mockResolvedValue(term)},timetableEntry:{findMany:lessons},schoolAssignmentSubmission:{count:submissions}}} as never,{getAssignments} as never);
 const result=await service.get("school","user","teacher");
 expect(getAssignments).toHaveBeenCalledWith("school","user");
 expect(submissions).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({assignment:expect.objectContaining({schoolId:"school",createdById:"user",classId:{in:["class"]}})})}));
 expect(result.items.find(row=>row.id==="grading")?.count).toBe(3);
});
