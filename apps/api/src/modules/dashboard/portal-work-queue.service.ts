import { ForbiddenException, Injectable } from "@nestjs/common";
import type { PortalWorkQueue } from "@schoolhub/shared";
import { PrismaService } from "../../prisma/prisma.service.js";
import { TeacherScopeService } from "../../common/scope/teacher-scope.service.js";

@Injectable()
export class PortalWorkQueueService {
  constructor(private readonly prisma: PrismaService, private readonly scope: TeacherScopeService) {}
  async get(schoolId: string, userId: string, role: string | undefined): Promise<PortalWorkQueue> {
    if (!role || !["owner","admin","headteacher","teacher","student"].includes(role)) throw new ForbiddenException("This role has no academic work queue.");
    const db=this.prisma.client;
    const term=await db.term.findFirst({where:{isCurrent:true,academicYear:{schoolId,isCurrent:true}},select:{id:true,name:true,academicYearId:true}});
    const result: PortalWorkQueue={generatedAt:new Date().toISOString(),role,term,items:[],lessons:[],upcoming:[]};
    const add=(id:string,title:string,detail:string,page:string,count:number)=>result.items.push({id,title,detail,page,count});
    if(!term){if(["owner","admin","headteacher"].includes(role))add("calendar","Set the current academic period","Choose a school year and current term before recording academic work.","academic-years",1);return result;}
    if(role==="teacher"){
      const assignments=await this.scope.getAssignments(schoolId,userId);
      if(!assignments.teacherId)return result;
      const classIds=[...new Set([...assignments.classTeacherClassIds,...assignments.subjectAssignments.map(row=>row.classId),...assignments.subjectStrandAssignments.map(row=>row.classId)])];
      const [lessons,ungraded,openPapers]=await Promise.all([
        db.timetableEntry.findMany({where:{schoolId,teacherId:assignments.teacherId,academicYearId:term.academicYearId,OR:[{termId:term.id},{termId:null}]},include:{timeSlot:true,subject:{select:{name:true}},class:{select:{name:true}}},orderBy:[{timeSlot:{dayOfWeek:"asc"}},{timeSlot:{startTime:"asc"}}],take:100}),
        db.schoolAssignmentSubmission.count({where:{status:"SUBMITTED",assignment:{schoolId,termId:term.id,createdById:userId,classId:{in:classIds},status:"PUBLISHED"}}}),
        db.internalExamPaper.count({where:{finalizedAt:null,session:{schoolId,termId:term.id,status:"OPEN"},OR:[...assignments.subjectAssignments.map(row=>({subjectId:row.subjectId,session:{classId:row.classId}})),{sections:{some:{teacherId:assignments.teacherId}}}]}}),
      ]);
      result.lessons=lessons.map(row=>({id:row.id,day:row.timeSlot.dayOfWeek,start:row.timeSlot.startTime,end:row.timeSlot.endTime,subject:row.subject?.name??row.label??"Lesson",className:row.class?.name??"School activity"}));
      add("register","Class registers","Open the current-term register for classes where you are class teacher.","attendance",assignments.classTeacherClassIds.length);
      add("grading","Submissions awaiting feedback","Published assignments created by you in your assigned classes.","assignments",ungraded);
      add("marks","Open mock papers","Assigned subject papers that have not been finalised.","internal-exams",openPapers);
      add("sba","SBA mark entry","Review current-term marks for your assigned classes and subjects.","assessments",classIds.length);
      return result;
    }
    if(role==="student"){
      const student=await db.student.findFirst({where:{schoolId,deletedAt:null,profile:{userId}},select:{id:true}});
      if(!student)return result;
      const enrollment=await db.enrollment.findFirst({where:{studentId:student.id,termId:term.id,status:"ACTIVE"},select:{classId:true}});
      if(!enrollment)return result;
      const tasks=await db.schoolAssignment.findMany({where:{schoolId,termId:term.id,classId:enrollment.classId,status:"PUBLISHED"},include:{submissions:{where:{studentId:student.id},select:{status:true}}},orderBy:[{dueAt:"asc"},{id:"asc"}]});
      result.upcoming=tasks.slice(0,100).map(row=>({id:row.id,title:row.title,dueAt:row.dueAt?.toISOString()??null,status:row.submissions[0]?.status??"TO_DO"}));
      add("todo","Assignments to submit","Open your learning tasks to write or update a response.","assignments",tasks.filter(row=>row.submissions.length===0).length);
      add("feedback","Published assignment feedback","Your graded submissions, available in assignments.","assignments",tasks.filter(row=>row.submissions[0]?.status==="GRADED").length);
      return result;
    }
    if(role==="headteacher" || role==="owner"){
      const [mocks,versions,pendingCorrections,classCount,pendingExcuses]=await Promise.all([
        db.internalMockReport.findMany({where:{schoolId,session:{termId:term.id}},distinct:["candidateId"],orderBy:[{candidateId:"asc"},{version:"desc"}],select:{stage:true}}),
        db.reportCardVersion.findMany({where:{schoolId,set:{termId:term.id}},distinct:["setId","studentId"],orderBy:[{setId:"asc"},{studentId:"asc"},{version:"desc"}],select:{stage:true}}),
        db.internalMockCorrection.count({where:{schoolId,status:"PENDING",session:{termId:term.id}}}),
        db.class.count({where:{schoolId,deletedAt:null,isActive:true,OR:[{academicYearId:term.academicYearId},{academicYearId:null}]}}),
        db.attendanceExcuseRequest.count({where:{schoolId,status:"PENDING"}}),
      ]);
      add("mock-review","Mock recommendations awaiting headteacher review","Latest candidate reports already recommended by the class teacher.","internal-exams",mocks.filter(row=>row.stage==="TEACHER_REVIEWED").length);
      add("mock-publish","Approved mock reports awaiting publication","Release only after both independent recommendations and integrity checks.","internal-exams",mocks.filter(row=>row.stage==="APPROVED").length);
      add("term-review","Term report recommendations","Latest term reports awaiting independent leadership review.","reports",versions.filter(row=>row.stage==="TEACHER_REVIEWED").length);
      add("publish","Approved reports awaiting publication","Check integrity and release approved reports through the existing publication controls.","reports",versions.filter(row=>row.stage==="APPROVED").length);
      add("excuses","Absence requests awaiting review","Review guardian explanations and private evidence; attendance marks remain a separate staff action.","attendance",pendingExcuses);
      add("coverage","Class attendance coverage","Classes available for instructional-day completeness review; this count is not a count of absent pupils.","attendance",classCount);
      add("corrections","Mock correction requests","Review reasons and supporting evidence before changing frozen results.","internal-exams",pendingCorrections);
    }
    const active={schoolId,status:"ACTIVE" as const,deletedAt:null};
    const [unlinked,unenrolled,unassigned,identities]=await Promise.all([
      db.student.count({where:{...active,guardians:{none:{guardian:{deletedAt:null,isActive:true}}}}}),
      db.student.count({where:{...active,enrollments:{none:{termId:term.id,status:"ACTIVE"}}}}),
      db.classSubject.count({where:{class:{schoolId,deletedAt:null,isActive:true},subject:{deletedAt:null,isActive:true},teacherId:null,strandAssignments:{none:{}}}}),
      db.student.findMany({where:active,select:{profile:{select:{firstName:true,lastName:true,dateOfBirth:true}}},orderBy:{id:"asc"},take:5001}),
    ]);
    const seen=new Set<string>();let possibleDuplicates=0;
    for(const row of identities.slice(0,5000)){
      if(!row.profile.dateOfBirth)continue;
      const key=[row.profile.firstName.trim().toLowerCase(),row.profile.lastName.trim().toLowerCase(),row.profile.dateOfBirth.toISOString().slice(0,10)].join("|");
      if(seen.has(key))possibleDuplicates++;else seen.add(key);
    }
    add("guardians","Missing active guardian links","Review student profiles; do not create duplicate family accounts.","students",unlinked);
    add("enrollments","Missing current-term enrollment","Active student records without an active enrollment this term.","enrollments",unenrolled);
    add("teachers","Unassigned teaching subjects","Class subjects with neither a whole-subject teacher nor strand assignments.","subjects",unassigned);
    add("duplicates","Potential duplicate identities",`${identities.length>5000?"First 5,000 active records checked. ":""}Matching name and date of birth needs human review; never merge automatically.`,"students",possibleDuplicates);
    return result;
  }
}
