import { describe,expect,it,vi } from "vitest";
import type { PrismaService } from "../../prisma/prisma.service.js";
import type { TeacherScopeService } from "../../common/scope/teacher-scope.service.js";
import { InternalExamsService } from "./internal-exams.service.js";

function createService(assignments:Awaited<ReturnType<TeacherScopeService["getAssignments"]>>){
  const findMany=vi.fn().mockResolvedValue([]);
  const prisma={client:{internalExamSession:{findMany}}} as unknown as PrismaService;
  const scope={getAssignments:vi.fn().mockResolvedValue(assignments)} as unknown as TeacherScopeService;
  return {service:new InternalExamsService(prisma,scope),findMany};
}
const teacherWith=(overrides:Partial<Awaited<ReturnType<TeacherScopeService["getAssignments"]>>>)=>({
  teacherId:"t1",classTeacherClassIds:[],subjectAssignments:[],subjectStrandAssignments:[],...overrides,
});

describe("InternalExamsService.list paper visibility",()=>{
  it("limits a teacher's papers to their assigned subjects inside the database query",async()=>{
    const {service,findMany}=createService(teacherWith({
      subjectAssignments:[{classId:"c1",subjectId:"math"}],
      subjectStrandAssignments:[{classId:"c1",subjectId:"ict",subjectStrandId:"hw"}],
    }));
    await service.list("school","user","teacher");
    const query=findMany.mock.calls[0]![0];
    expect(query.where).toEqual({schoolId:"school",classId:{in:["c1"]}});
    expect(query.select.papers.where).toEqual({OR:[
      {session:{classId:"c1"},subjectId:{in:["math","ict"]}},
    ]});
  });

  it("still lists a class teacher's sessions, with no papers unless they teach a subject there",async()=>{
    const {service,findMany}=createService(teacherWith({classTeacherClassIds:["c9"]}));
    await service.list("school","user","teacher");
    const query=findMany.mock.calls[0]![0];
    expect(query.where.classId).toEqual({in:["c9"]});
    expect(query.select.papers.where).toEqual({OR:[]});
  });

  it("does not query at all for a teacher with no classes",async()=>{
    const {service,findMany}=createService(teacherWith({}));
    await expect(service.list("school","user","teacher")).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("gives school managers every paper",async()=>{
    const {service,findMany}=createService(teacherWith({}));
    await service.list("school","user","headteacher");
    const query=findMany.mock.calls[0]![0];
    expect(query.where).toEqual({schoolId:"school"});
    expect(query.select.papers.where).toBeUndefined();
  });
});
